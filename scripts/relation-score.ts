// 관계 품질 채점 (PIE-53) — 생성된 관계를 위키백과 원문에 대고 채점한다.
//
// 개념 추출 채점(wiki-score.ts)은 정답지가 편집자 판정(본문 [[링크]])이었다.
// 관계에는 그런 정답지가 없다. 대신 원문 자체를 정답지로 쓴다 —
// 관계의 근거가 원문에 있는지는 문자열로 확인할 수 있고, 논란이 없다.
//
// 오류 유형(PIE-53) → 이 스크립트가 재는 축:
//   근거 환각    → §1 reason 의 어휘가 원문에 있는가 / quote 가 있는가
//   관계 무근거  → §2 두 개념이 원문 한 문장에 함께 나오는가
//   타입 부정확  → §3 explanation 의 술어 어휘가 가리키는 타입과 일치하는가
//   방향 반전    → §4 explanation 의 어순이 (source,target) 배정과 맞는가
//   관계 누락    → §5 원문이 한 문장에 묶은 쌍 중 관계가 안 만들어진 것
//   개념 누락    → §6 그 때문에 관계 대상 자체가 없던 개념
// 그리고 §7 confidence 와 위 판정의 상관, §8 실행 간 재현성, §9 그래프 분리.
//
// 실행: npm run relation-score -- --dir <수집디렉토리> [--runs run-0,run-1,...]

import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { normalizeTitle } from "../src/lib/llmApply";

type GroundTruth = { order: number; file: string; title: string; bodyLinks: string[]; redirects: string[] };
type Relation = {
  sourceConceptTitle: string;
  targetConceptTitle: string;
  relationType: string;
  strength: number;
  confidence: number;
  explanation: string;
  evidence: Array<{ sourceId: string; quote?: string; reason: string }>;
};
type Round = { round: number; doc: string; concepts: string[]; raw: { relations: Relation[] } };

// ── 문자열 대조 기반 ──────────────────────────────────────────
// 한국어는 띄어쓰기가 흔들린다("인공신경망"/"인공 신경망"). 공백·구두점을 지우고 맞춘다.
const squash = (s: string) => s.replace(/[\s​]/g, "").replace(/[.,·'"()\[\]{}<>「」『』…—–\-]/g, "").toLowerCase();

// 한국어 조사·어미가 붙은 토큰을 원문과 맞추기 위해 뒤에서 최대 3자까지 떼어본다.
// 2자 미만으로 줄면 포기한다(1자 토큰은 어디에나 있어 근거가 되지 못한다).
function inCorpus(token: string, corpus: string): boolean {
  for (let cut = 0; cut <= 3; cut++) {
    const t = token.slice(0, token.length - cut);
    if (t.length < 2) break;
    if (corpus.includes(squash(t))) return true;
  }
  return false;
}

// 근거 문장의 화법 어휘 — "원문에서 …라고 설명함". 원문에 없는 게 당연하므로 환각 판정에서 뺀다.
const META =
  /^(원문에서|원문은|원문에|본문에서|본문은|본문에|문서에서|설명함|설명하며|설명하고|설명한다|기술함|기술하고|명시함|명시하고|언급함|언급하고|서술함|서술하고|서술되어|정의함|정의하며|제시함|나타냄|있음|있습니다|있다|한다|이라고|라고|대해|대한|통해|위해|위한|경우|내용|부분|측면|관점|점을|점이|것을|것이|이를|이는|해당|또한|그리고|하지만)$/;

// 내용어 후보 — 한글 2자 이상, 영문/숫자 3자 이상. 화법 어휘는 뺀다.
function contentTokens(s: string): string[] {
  return [...s.matchAll(/[가-힣]{2,}|[A-Za-z][A-Za-z0-9]{2,}/g)].map((m) => m[0]).filter((t) => !META.test(t));
}

// 인용 주장이 참인가 — 완전 일치를 요구하면 멀쩡한 인용이 거짓으로 잡힌다.
// 실제 사례: 원문 "인공신경망(artificial neural network, ANN)은 기계학습과…" 를
// "인공신경망은 기계학습과…" 로 줄여 인용 → 괄호 안이 빠져 문자열이 어긋난다.
// 그래서 6자 n-gram 이 원문에 얼마나 덮이는지로 본다. 환각은 커버리지가 무너진다.
const NGRAM = 6;
const COVER_MIN = 0.8;
function ngramCoverage(q: string, grams: Set<string>): number {
  const s = squash(q).replace(/\.{2,}|…/g, "");
  if (s.length < NGRAM) return 1;
  let hit = 0;
  let total = 0;
  for (let i = 0; i + NGRAM <= s.length; i++) {
    total++;
    if (grams.has(s.slice(i, i + NGRAM))) hit++;
  }
  return total ? hit / total : 1;
}

// 문장 분리 — 위키백과 평문은 개행이 문단 경계, 마침표가 문장 경계.
function sentences(text: string): string[] {
  return text
    .split(/\n+/)
    .flatMap((p) => p.split(/(?<=[.!?。])\s+/))
    .map((s) => s.trim())
    .filter((s) => s.length > 5);
}

// ── 타입 어휘 사전 — explanation 이 쓰는 술어가 가리키는 관계 타입 ──
// relation-types.md §2 의 의미를 한국어 술어로 옮긴 것. 여러 타입이 잡히면 그 집합에 실제 타입이
// 들어있는지만 본다(단정하지 않는다 — 이 사전은 검출기이지 정답지가 아니다).
const LEXICON: Array<[RegExp, string]> = [
  [/유발|일으키|초래|야기|이어진다|귀결/, "causes"],
  [/해결|극복|완화한다|보완한다|막는다|방지/, "solves"],
  [/반면|대조|차이|구별|다르다|달리|와 달리|과 달리/, "contrasts"],
  [/혼동|헷갈|착각/, "confused_with"],
  [/먼저|선수|선행|알아야|이해하려면|전제/, "prerequisite"],
  [/구성 요소|일종|하위|포함되|속한다|한 갈래|한 분야|부분이다/, "part_of"],
  [/사용된다|활용된다|쓰인다|적용된다|이용된다|채택/, "used_in"],
];
function lexiconTypes(explanation: string): string[] {
  return LEXICON.filter(([re]) => re.test(explanation)).map(([, t]) => t);
}

// ── 방향 정답지 — 원문 문장이 어느 쪽을 전체/맥락/대상으로 말하는가 ──
// relation-types.md §2: part_of 는 source 가 부분·target 이 전체, used_in 은 target 이 맥락,
// causes/solves 는 target 이 대상. 원문 문장에서 개념 바로 뒤에 오는 조사구가 그 역할을 정한다.
// 패턴은 squash(공백 제거) 문장에 대고 맞춘다.
const ROLE: Array<[RegExp, "whole" | "context" | "object"]> = [
  [/^(의(한)?(분야|일종|하위|갈래|종류|구성요소|부분|집합|영역|형태)|에속하|의범주|을구성|의.{0,8}중하나)/, "whole"],
  [/^(에서?(널리)?(사용|활용|이용|적용|쓰이|채택)|에포함|에서영감)/, "context"],
  [/^(을|를)(유발|일으키|초래|야기|해결|극복|완화|막)/, "object"],
];
const EXPECT: Record<string, "whole" | "context" | "object"> = {
  part_of: "whole",
  used_in: "context",
  causes: "object",
  solves: "object",
};

// 지지 문장에서 두 개념의 역할을 읽어, 계약이 요구하는 쪽에 target 이 있는지 본다.
// 원문이 역할을 말해주지 않으면(패턴 미검출) null — 판정하지 않는다.
function directionFromSource(sentSquashed: string, r: Relation): { judged: boolean; msg: string | null } {
  const want = EXPECT[r.relationType];
  if (!want) return { judged: false, msg: null };
  const s = squash(r.sourceConceptTitle);
  const t = squash(r.targetConceptTitle);
  const roleOf = (c: string): "whole" | "context" | "object" | null => {
    const i = sentSquashed.indexOf(c);
    if (i < 0) return null;
    const after = sentSquashed.slice(i + c.length, i + c.length + 12);
    return ROLE.find(([re]) => re.test(after))?.[1] ?? null;
  };
  const rs = roleOf(s);
  const rt = roleOf(t);
  if (rs === null && rt === null) return { judged: false, msg: null }; // 원문이 역할을 말하지 않았다
  if (rs === want && rt !== want)
    return { judged: true, msg: `원문은 ${r.sourceConceptTitle} 를 ${want} 로 말한다 — ${r.relationType} 는 target 이 ${want} 여야 한다` };
  return { judged: true, msg: null };
}

// explanation 안의 선수 어휘로 prerequisite 방향을 본다 — 계약상 target 이 선수다.
const PRECEDE = /(먼저|선수|선행|전제|알아야|이해하려면)/;
function directionFromExplanation(r: Relation): string | null {
  if (r.relationType !== "prerequisite") return null;
  const e = r.explanation;
  if (e.indexOf(r.sourceConceptTitle) < 0 || e.indexOf(r.targetConceptTitle) < 0) return null;
  const m = PRECEDE.exec(e);
  if (!m) return null;
  const before = e.slice(0, m.index);
  if (before.includes(r.sourceConceptTitle) && !before.includes(r.targetConceptTitle))
    return "prerequisite 인데 설명은 source 를 선수로 말한다";
  return null;
}

function argv(flag: string): string | undefined {
  const i = process.argv.indexOf(flag);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

const dir = argv("--dir");
if (!dir) throw new Error("--dir <수집디렉토리> 필요");
const runNames = (argv("--runs") ?? "run-0").split(",").map((s) => s.trim());

const gt = JSON.parse(readFileSync(join(dir, "ground-truth.json"), "utf-8")) as GroundTruth[];

// 문서별 원문 — 평문 그대로(정답지) + squash 판(대조용) + 문장 배열.
type Doc = { title: string; raw: string; squashed: string; sents: string[]; links: string[] };
const docs = new Map<string, Doc>();
for (const g of gt) {
  const raw = readFileSync(join(dir, "input", g.file), "utf-8");
  docs.set(g.title, { title: g.title, raw, squashed: squash(raw), sents: sentences(raw), links: g.bodyLinks });
}
const corpusAll = [...docs.values()].map((d) => d.squashed).join("\n");

// 전 코퍼스 6-gram — 인용 주장 검증용. 인용은 문서를 넘나드므로 한 통에 넣는다.
const CORPUS_GRAMS = new Set<string>();
for (let i = 0; i + NGRAM <= corpusAll.length; i++) CORPUS_GRAMS.add(corpusAll.slice(i, i + NGRAM));

const pct = (n: number, d: number) => (d === 0 ? "—" : `${((n / d) * 100).toFixed(0)}%`);

type Verdict = {
  run: string;
  doc: string;
  rel: Relation;
  hasQuote: boolean;
  quoteInSource: boolean | null; // quote 없으면 null
  claimedQuotes: string[]; // reason 이 따옴표로 인용했다고 주장한 문자열
  claimedFalse: string[]; // 그중 원문에 없는 것
  ungroundedTokens: string[]; // reason 안에서 원문에 없는 어휘
  supportSentence: string | null; // 두 개념이 함께 나오는 원문 문장
  lexTypes: string[];
  typeMismatch: boolean;
  dirJudged: boolean; // 원문이 방향을 말해줘서 대조가 가능했는가
  dirSuspect: string | null;
  badSourceId: boolean;
};

function judge(run: string, round: Round, r: Relation): Verdict {
  const doc = docs.get(round.doc);
  const corpus = doc ? doc.squashed : corpusAll;
  const ev = r.evidence ?? [];
  const quote = ev.map((e) => e.quote).find((q) => q && q.trim().length > 0);
  const reason = ev.map((e) => e.reason ?? "").join(" ");

  // reason 이 따옴표로 원문을 인용했다고 주장하는 경우 — 이건 문자열로 참·거짓을 가릴 수 있다.
  // (quote 필드는 비어 있으므로 근거 축에서 유일하게 검증 가능한 부분이다.)
  const claimed = [...reason.matchAll(/['"'"「『]([^'"'"」』]{8,})['"'"」』]/g)].map((m) => m[1]);

  // 근거 문장(reason)의 내용어 중 원문에 없는 것. 개념 제목 자체는 뺀다(제목은 우리가 만든 표기).
  const own = new Set([...contentTokens(r.sourceConceptTitle), ...contentTokens(r.targetConceptTitle)]);
  const ungrounded = [...new Set(contentTokens(reason))].filter((t) => !own.has(t) && !inCorpus(t, corpus));

  // 지지 문장 — 두 개념이 같은 문장에 함께 나오는가. 전 문서를 뒤진다(문서 간 관계도 있으므로).
  const a = squash(r.sourceConceptTitle);
  const b = squash(r.targetConceptTitle);
  let support: string | null = null;
  let supportSquashed = "";
  for (const d of docs.values()) {
    const hit = d.sents.find((s) => {
      const q = squash(s);
      return q.includes(a) && q.includes(b);
    });
    if (hit) {
      support = hit;
      supportSquashed = squash(hit);
      break;
    }
  }

  const dirFromSrc = support ? directionFromSource(supportSquashed, r) : { judged: false, msg: null };
  const lex = lexiconTypes(r.explanation);
  return {
    run,
    doc: round.doc,
    rel: r,
    hasQuote: Boolean(quote),
    quoteInSource: quote ? corpus.includes(squash(quote)) : null,
    claimedQuotes: claimed,
    claimedFalse: claimed.filter((q) => ngramCoverage(q, CORPUS_GRAMS) < COVER_MIN),
    ungroundedTokens: ungrounded,
    supportSentence: support,
    lexTypes: lex,
    typeMismatch: lex.length > 0 && !lex.includes(r.relationType),
    dirJudged: dirFromSrc.judged,
    dirSuspect: dirFromSrc.msg ?? directionFromExplanation(r),
    // 계약(llm-output-schema.md §2-4): evidence[].sourceId 는 입력으로 준 Source ID 여야 한다.
    badSourceId: ev.some((e) => !/^src-\d+$/.test(e.sourceId ?? "")),
  };
}

// ── 실행별 채점 ─────────────────────────────────────────────
const byRun = new Map<string, Verdict[]>();
const roundsByRun = new Map<string, Round[]>();
for (const name of runNames) {
  const rounds = JSON.parse(readFileSync(join(dir, "results", `${name}.json`), "utf-8")) as Round[];
  roundsByRun.set(name, rounds);
  byRun.set(
    name,
    rounds.flatMap((rd) => rd.raw.relations.map((r) => judge(name, rd, r))),
  );
}
const all = [...byRun.values()].flat();

console.log(`\n관계 채점 — 실행 ${runNames.length}개 (${runNames.join(", ")}), 관계 총 ${all.length}개\n`);

console.log("═══ §1 근거 환각 — evidence 가 원문에 있는가 ═══\n");
console.log("실행     관계   quote있음    인용주장   그중 원문에 없음    원문에 없는 어휘 섞임");
for (const [name, vs] of byRun) {
  const q = vs.filter((v) => v.hasQuote).length;
  const cq = vs.filter((v) => v.claimedQuotes.length > 0).length;
  const cf = vs.filter((v) => v.claimedFalse.length > 0).length;
  const dirtyN = vs.filter((v) => v.ungroundedTokens.length > 0).length;
  console.log(
    `${name.padEnd(8)} ${String(vs.length).padStart(4)}   ${String(q).padStart(4)} ${pct(q, vs.length).padStart(5)}` +
      `     ${String(cq).padStart(4)} ${pct(cq, vs.length).padStart(5)}` +
      `      ${String(cf).padStart(4)} ${pct(cf, cq).padStart(6)}` +
      `           ${String(dirtyN).padStart(4)} ${pct(dirtyN, vs.length).padStart(5)}`,
  );
}
const falseQ = all.filter((v) => v.claimedFalse.length > 0);
if (falseQ.length) {
  console.log(`\n  원문에 없는 문장을 인용했다고 주장한 관계 ${falseQ.length}건:`);
  for (const v of falseQ.slice(0, 10)) {
    console.log(
      `   [${v.run}] conf ${v.rel.confidence.toFixed(2)}  ${v.rel.sourceConceptTitle} ${v.rel.relationType} ${v.rel.targetConceptTitle}`,
    );
    for (const q of v.claimedFalse) console.log(`      주장한 인용(원문에 없음): 「${q.slice(0, 80)}」`);
  }
} else console.log("\n  따옴표로 원문을 인용했다고 주장한 것 중 거짓: 0건");
const dirty = all.filter((v) => v.ungroundedTokens.length > 0);
console.log(`\n  미근거 어휘가 섞인 근거 ${dirty.length}건 — 상위 12건:`);
for (const v of dirty.slice(0, 12)) {
  console.log(
    `   [${v.run}] ${v.rel.sourceConceptTitle} ${v.rel.relationType} ${v.rel.targetConceptTitle} (conf ${v.rel.confidence})`,
  );
  console.log(`      원문에 없는 어휘: ${v.ungroundedTokens.join(", ")}`);
  console.log(`      근거: ${(v.rel.evidence[0]?.reason ?? "").slice(0, 90)}`);
}

console.log("\n═══ §2 관계 무근거 — 두 개념이 원문 한 문장에 함께 나오는가 ═══\n");
console.log("실행     관계   지지문장 있음   없음");
for (const [name, vs] of byRun) {
  const s = vs.filter((v) => v.supportSentence).length;
  console.log(
    `${name.padEnd(8)} ${String(vs.length).padStart(4)}   ${String(s).padStart(4)} ${pct(s, vs.length).padStart(5)}   ${String(vs.length - s).padStart(4)} ${pct(vs.length - s, vs.length).padStart(5)}`,
  );
}
const noSupport = all.filter((v) => !v.supportSentence);
console.log(`\n  지지 문장 없는 관계 ${noSupport.length}건 — 상위 12건 (conf 내림차순):`);
for (const v of [...noSupport].sort((a, b) => b.rel.confidence - a.rel.confidence).slice(0, 12)) {
  console.log(
    `   [${v.run}] conf ${v.rel.confidence.toFixed(2)}  ${v.rel.sourceConceptTitle} ${v.rel.relationType} ${v.rel.targetConceptTitle}`,
  );
}

console.log("\n═══ §3 타입 부정확 — 설명의 술어와 relationType 이 어긋나는가 ═══\n");
console.log("실행     사전이 타입을 짚은 관계   그중 불일치");
for (const [name, vs] of byRun) {
  const lexed = vs.filter((v) => v.lexTypes.length > 0);
  const mm = lexed.filter((v) => v.typeMismatch);
  console.log(`${name.padEnd(8)} ${String(lexed.length).padStart(6)}                  ${String(mm.length).padStart(4)} ${pct(mm.length, lexed.length).padStart(5)}`);
}
for (const v of all.filter((v) => v.typeMismatch).slice(0, 12)) {
  console.log(
    `   [${v.run}] ${v.rel.relationType} ← 설명은 ${v.lexTypes.join("/")} : ${v.rel.sourceConceptTitle} → ${v.rel.targetConceptTitle}`,
  );
  console.log(`      ${v.rel.explanation.slice(0, 100)}`);
}

console.log("\n═══ §4 방향 반전 — 설명 어순과 (source,target) 배정 ═══\n");
const dirs = all.filter((v) => v.dirSuspect);
const judgeable = all.filter((v) => v.dirJudged).length;
console.log(`  원문이 방향을 말해줘 대조가 가능했던 관계: ${judgeable}/${all.length} (${pct(judgeable, all.length)})`);
console.log(`  그중 자동 검출된 반전 후보 ${dirs.length}건`);
for (const v of dirs) {
  console.log(`   [${v.run}] ${v.rel.sourceConceptTitle} ${v.rel.relationType} ${v.rel.targetConceptTitle} — ${v.dirSuspect}`);
  console.log(`      ${v.rel.explanation.slice(0, 100)}`);
}
const asymm = all.filter((v) => ["prerequisite", "part_of", "causes", "solves", "used_in"].includes(v.rel.relationType));
const noBoth = asymm.filter((v) => !v.rel.explanation.includes(v.rel.sourceConceptTitle) || !v.rel.explanation.includes(v.rel.targetConceptTitle));
console.log(`\n  방향성 관계 ${asymm.length}건 중 설명이 두 개념을 다 부르지 않아 방향을 대조조차 못 하는 것: ${noBoth.length}건 (${pct(noBoth.length, asymm.length)})`);

console.log("\n═══ §5 관계 누락 — 원문이 한 문장에 묶었는데 관계가 없다 ═══\n");
for (const [name, rounds] of roundsByRun) {
  const made = new Set<string>();
  for (const rd of rounds)
    for (const r of rd.raw.relations) {
      const a = normalizeTitle(r.sourceConceptTitle);
      const b = normalizeTitle(r.targetConceptTitle);
      made.add([a, b].sort().join("|"));
    }
  const concepts = [...new Set(rounds.flatMap((rd) => rd.concepts))];
  let pairsWithSentence = 0;
  const missing: Array<[string, string, string]> = [];
  for (let i = 0; i < concepts.length; i++)
    for (let j = i + 1; j < concepts.length; j++) {
      const A = squash(concepts[i]);
      const B = squash(concepts[j]);
      // "기계 학습" ⊂ "자율 학습 (기계 학습)" 처럼 한쪽이 다른 쪽 표기에 포함되면 공존은 착시다.
      if (A.includes(B) || B.includes(A)) continue;
      let hit: string | null = null;
      for (const d of docs.values()) {
        const s = d.sents.find((s) => s.length >= 25 && squash(s).includes(A) && squash(s).includes(B));
        if (s) {
          hit = s;
          break;
        }
      }
      if (!hit) continue;
      pairsWithSentence++;
      const key = [normalizeTitle(concepts[i]), normalizeTitle(concepts[j])].sort().join("|");
      if (!made.has(key)) missing.push([concepts[i], concepts[j], hit]);
    }
  console.log(
    `${name}: 개념 ${concepts.length}개 · 원문 한 문장에 함께 나온 쌍 ${pairsWithSentence}개 · 그중 관계 만든 것 ${pairsWithSentence - missing.length} (${pct(pairsWithSentence - missing.length, pairsWithSentence)})`,
  );
  for (const [a, b, s] of missing.slice(0, 8)) console.log(`   누락: ${a} ↔ ${b}\n      「${s.slice(0, 90)}」`);
}

console.log("\n═══ §6 개념 누락 — 관계 대상 자체가 없던 것 ═══\n");
// 본문링크로 여러 문서에 걸쳐 불린 개념인데 추출되지 않은 것 = 관계를 만들 노드가 애초에 없었다.
const spread = new Map<string, number>();
for (const g of gt) for (const l of new Set(g.bodyLinks)) spread.set(normalizeTitle(l), (spread.get(normalizeTitle(l)) ?? 0) + 1);
for (const [name, rounds] of roundsByRun) {
  const got = new Set(rounds.flatMap((rd) => rd.concepts).map(normalizeTitle));
  const missed = [...spread.entries()].filter(([k, n]) => n >= 3 && !got.has(k)).sort((a, b) => b[1] - a[1]);
  console.log(`${name}: 3개 이상 문서 본문에 불린 개념 중 미추출 ${missed.length}개`);
  console.log("   " + missed.slice(0, 15).map(([k, n]) => `${k}(${n})`).join(", "));
}

console.log("\n═══ §7 confidence 가 오류를 가리키는가 ═══\n");
console.log("confidence   관계   지지문장 없음   미근거어휘 포함");
const buckets: Array<[string, (c: number) => boolean]> = [
  ["1.00", (c) => c >= 1],
  ["0.90~0.99", (c) => c >= 0.9 && c < 1],
  ["0.70~0.89", (c) => c >= 0.7 && c < 0.9],
  ["0.50~0.69", (c) => c >= 0.5 && c < 0.7],
  ["< 0.50", (c) => c < 0.5],
];
for (const [label, f] of buckets) {
  const vs = all.filter((v) => f(v.rel.confidence));
  if (!vs.length) continue;
  const ns = vs.filter((v) => !v.supportSentence).length;
  const ug = vs.filter((v) => v.ungroundedTokens.length > 0).length;
  console.log(
    `${label.padEnd(11)} ${String(vs.length).padStart(4)}   ${String(ns).padStart(4)} ${pct(ns, vs.length).padStart(5)}   ${String(ug).padStart(4)} ${pct(ug, vs.length).padStart(5)}`,
  );
}
const lowConf = all.filter((v) => v.rel.confidence < 0.5).length;
const relatedTo = all.filter((v) => v.rel.relationType === "related_to").length;
console.log(`\n  현재 품질 미터가 보는 두 값: confidence<0.5 관계 ${lowConf}개 · related_to 비율 ${pct(relatedTo, all.length)}`);
console.log(`  계약 위반(evidence[].sourceId 가 입력 Source ID 가 아님): ${all.filter((v) => v.badSourceId).length}건`);

console.log("\n═══ §8 실행 간 재현성 ═══\n");
if (byRun.size > 1) {
  const sets = [...byRun.entries()].map(([name, vs]) => [
    name,
    new Set(vs.map((v) => `${normalizeTitle(v.rel.sourceConceptTitle)}|${v.rel.relationType}|${normalizeTitle(v.rel.targetConceptTitle)}`)),
  ] as [string, Set<string>]);
  console.log("  실행쌍            공통   합집합   Jaccard");
  for (let i = 0; i < sets.length; i++)
    for (let j = i + 1; j < sets.length; j++) {
      const [na, A] = sets[i];
      const [nb, B] = sets[j];
      const inter = [...A].filter((x) => B.has(x)).length;
      const uni = new Set([...A, ...B]).size;
      console.log(`  ${na} vs ${nb}   ${String(inter).padStart(4)}   ${String(uni).padStart(5)}    ${(inter / uni).toFixed(2)}`);
    }
  const counts = new Map<string, number>();
  for (const [, S] of sets) for (const k of S) counts.set(k, (counts.get(k) ?? 0) + 1);
  const nAll = [...counts.values()].filter((n) => n === sets.length).length;
  console.log(`\n  전체 ${counts.size}종 중 모든 실행에 나온 관계 ${nAll}종 (${pct(nAll, counts.size)}), 한 번만 나온 관계 ${[...counts.values()].filter((n) => n === 1).length}종`);

  // 문서 단위 — 중간에 끊긴 실행이 섞이면 실행 전체 비교는 왜곡된다. 같은 문서를 몇 번 돌렸는지로 본다.
  console.log("\n  문서별 (그 문서를 처리한 실행끼리만 비교)");
  console.log("  문서                    실행수   관계종수   전 실행 공통   1회만");
  const docRuns = new Map<string, Map<string, Set<string>>>();
  for (const [name, rounds] of roundsByRun)
    for (const rd of rounds) {
      if (!docRuns.has(rd.doc)) docRuns.set(rd.doc, new Map());
      docRuns
        .get(rd.doc)!
        .set(
          name,
          new Set(rd.raw.relations.map((r) => `${normalizeTitle(r.sourceConceptTitle)}|${r.relationType}|${normalizeTitle(r.targetConceptTitle)}`)),
        );
    }
  for (const [docTitle, m] of docRuns) {
    if (m.size < 2) continue;
    const c = new Map<string, number>();
    for (const S of m.values()) for (const k of S) c.set(k, (c.get(k) ?? 0) + 1);
    const common = [...c.values()].filter((n) => n === m.size).length;
    const once = [...c.values()].filter((n) => n === 1).length;
    console.log(
      `  ${docTitle.padEnd(22)} ${String(m.size).padStart(4)}   ${String(c.size).padStart(6)}   ${String(common).padStart(8)} ${pct(common, c.size).padStart(5)}   ${String(once).padStart(4)} ${pct(once, c.size)}`,
    );
  }
} else console.log("  실행 1개 — --runs 로 2개 이상 주면 비교한다.");

// ── §10 관계 정답지 대조 — relation-truth.json 이 있는 표본에서만 ──────────
// 위키백과 코퍼스에는 관계 정답지가 없다. PIE-53 재현 표본에는 있다(계약 문서가 예시로 박아둔 3건 포함).
// 여기서만 정밀도·재현율을 실제로 계산할 수 있고, 이슈의 채점표와 같은 형태가 된다.
// optional: 원문 근거가 있어 나와도 오답이 아니지만, 필수로 요구하지는 않는 관계.
// 정밀도에서는 정답으로 세고 재현율 분모에서는 뺀다 — 안 그러면 맞는 관계가 "초과"로 깎인다.
type Truth = { source: string; target: string; types: string[]; directed: boolean; optional?: boolean; basis: string };
const truthPath = join(dir, "relation-truth.json");
if (existsSync(truthPath)) {
  const truth = (JSON.parse(readFileSync(truthPath, "utf-8")) as { relations: Truth[] }).relations;
  console.log("\n═══ §10 관계 정답지 대조 (정밀도·재현율) ═══\n");
  const pairKey = (a: string, b: string) => [normalizeTitle(a), normalizeTitle(b)].sort().join("|");

  for (const [name, vs] of byRun) {
    const hitTruth = new Set<number>();
    const rows: string[] = [];
    for (const v of vs) {
      const r = v.rel;
      const k = pairKey(r.sourceConceptTitle, r.targetConceptTitle);
      const idx = truth.findIndex((t) => pairKey(t.source, t.target) === k);
      if (idx < 0) {
        rows.push(`  ❌ 초과   ${r.sourceConceptTitle} ${r.relationType} ${r.targetConceptTitle} (conf ${r.confidence})`);
        continue;
      }
      const t = truth[idx];
      const typeOk = t.types.includes(r.relationType);
      const dirOk =
        !t.directed ||
        (normalizeTitle(r.sourceConceptTitle) === normalizeTitle(t.source) &&
          normalizeTitle(r.targetConceptTitle) === normalizeTitle(t.target));
      if (typeOk && dirOk) {
        hitTruth.add(idx);
        rows.push(`  ✅ 정답   ${r.sourceConceptTitle} ${r.relationType} ${r.targetConceptTitle}`);
      } else if (!dirOk && typeOk) {
        rows.push(`  ↔ 방향반전 ${r.sourceConceptTitle} ${r.relationType} ${r.targetConceptTitle} — 정답은 ${t.source} → ${t.target}`);
      } else {
        rows.push(`  △ 타입틀림 ${r.sourceConceptTitle} ${r.relationType} ${r.targetConceptTitle} — 정답 타입 ${t.types.join("/")}`);
      }
    }
    const correct = rows.filter((x) => x.includes("✅")).length;
    const required = truth.filter((t) => !t.optional).length;
    const hitRequired = [...hitTruth].filter((i) => !truth[i].optional).length;
    console.log(
      `${name}: 생성 ${vs.length}건 중 정답 ${correct}건 (정밀도 ${pct(correct, vs.length)}) · 필수 정답지 ${required}건 중 ${hitRequired}건 재현 (재현율 ${pct(hitRequired, required)})`,
    );
    for (const x of rows) console.log(x);
    const missed = truth.filter((t, i) => !hitTruth.has(i) && !t.optional);
    if (missed.length) {
      console.log(`  — 나와야 했는데 안 나온 관계 ${missed.length}건:`);
      for (const t of missed) console.log(`     ${t.source} ${t.types.join("/")} ${t.target} ← 「${t.basis.slice(0, 60)}」`);
    }
    console.log("");
  }
}

console.log("\n═══ §9 그래프 분리 ═══\n");
for (const [name, rounds] of roundsByRun) {
  const parent = new Map<string, string>();
  const find = (x: string): string => (parent.get(x) === x || !parent.has(x) ? x : (parent.set(x, find(parent.get(x)!)), parent.get(x)!));
  const add = (x: string) => {
    if (!parent.has(x)) parent.set(x, x);
  };
  for (const rd of rounds) for (const c of rd.concepts) add(normalizeTitle(c));
  for (const rd of rounds)
    for (const r of rd.raw.relations) {
      const a = normalizeTitle(r.sourceConceptTitle);
      const b = normalizeTitle(r.targetConceptTitle);
      add(a);
      add(b);
      parent.set(find(a), find(b));
    }
  const comps = new Map<string, string[]>();
  for (const k of parent.keys()) {
    const root = find(k);
    if (!comps.has(root)) comps.set(root, []);
    comps.get(root)!.push(k);
  }
  const sorted = [...comps.values()].sort((a, b) => b.length - a.length);
  console.log(`${name}: 노드 ${parent.size}개 · 컴포넌트 ${sorted.length}개 · 최대 덩어리 ${sorted[0]?.length ?? 0}개`);
  for (const c of sorted.slice(1, 6)) console.log(`   분리: ${c.join(", ")}`);
}

writeFileSync(
  join(dir, "results", "relation-score.json"),
  JSON.stringify(
    all.map((v) => ({
      run: v.run,
      doc: v.doc,
      source: v.rel.sourceConceptTitle,
      type: v.rel.relationType,
      target: v.rel.targetConceptTitle,
      confidence: v.rel.confidence,
      hasQuote: v.hasQuote,
      quoteInSource: v.quoteInSource,
      claimedQuotes: v.claimedQuotes,
      claimedFalse: v.claimedFalse,
      ungroundedTokens: v.ungroundedTokens,
      supportSentence: v.supportSentence,
      lexTypes: v.lexTypes,
      typeMismatch: v.typeMismatch,
      dirJudged: v.dirJudged,
      dirSuspect: v.dirSuspect,
      badSourceId: v.badSourceId,
    })),
    null,
    2,
  ),
  "utf-8",
);
console.log(`\n저장: ${join(dir, "results", "relation-score.json")}`);
