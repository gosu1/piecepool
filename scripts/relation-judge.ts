// 관계 LLM 심판 (PIE-53 §검출 수단 실측) — 관계 하나씩 원문 발췌와 함께 채점시킨다.
//
// 목적은 "정답률"이 아니라 "LLM 으로 검출이 되는가"다. 그래서 심판에게 원문 문장을
// 그대로 복사해 오라고 요구하고, 그 인용이 실제로 원문에 있는지 우리가 다시 문자열로 확인한다.
// 심판이 인용을 지어내면 그 판정은 신뢰 구간 밖으로 뺀다 — 심판의 환각률도 같이 실측된다.
//
// 실행: npm run relation-judge -- --dir <수집디렉토리> --run run-1 [--limit N]

import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { chatJsonWithRetry, GEMINI_MODEL } from "../src/llm/gemini";
import { sleep } from "../src/llm/http";

type GroundTruth = { file: string; title: string };
type Relation = {
  sourceConceptTitle: string;
  targetConceptTitle: string;
  relationType: string;
  confidence: number;
  explanation: string;
  evidence: Array<{ sourceId: string; quote?: string; reason: string }>;
};
type Round = { round: number; doc: string; raw: { relations: Relation[] } };

const squash = (s: string) => s.replace(/\s/g, "").replace(/[.,·'"()\[\]{}<>「」『』…—–\-]/g, "").toLowerCase();

// relation-types.md §2 — 심판이 계약 기준으로 타입을 보게 한다. 이 표가 없으면 심판은 상식으로 채점한다.
const TYPE_TABLE = `
prerequisite: A를 이해하려면 B가 선수 (target 이 먼저 배워야 하는 쪽)
part_of: A는 B의 구성 요소 (source 가 부분, target 이 전체)
used_in: A가 B 안에서 활용됨 (source 가 도구, target 이 맥락)
causes: A가 B를 유발 (source 가 원인, target 이 결과)
solves: A가 B를 해결 (source 가 해법, target 이 문제)
contrasts: A와 B는 대조됨 (대칭)
confused_with: 학습자가 A와 B를 자주 혼동 (대칭)
related_to: 일반 연관 — 최종 수단. 위 타입이 가능하면 쓰지 않는다
extracted_from / explained_by / tested_in / review_needed: 이 실험 범위 밖
`.trim();

const SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["supported", "quote", "directionOk", "typeOk", "betterType", "evidenceFaithful", "verdict", "note"],
  properties: {
    supported: { type: "boolean" },
    quote: { type: "string" },
    directionOk: { type: "boolean" },
    typeOk: { type: "boolean" },
    betterType: { type: "string" },
    evidenceFaithful: { type: "boolean" },
    verdict: { type: "string", enum: ["correct", "minor", "wrong"] },
    note: { type: "string" },
  },
};

type Judgement = {
  supported: boolean;
  quote: string;
  directionOk: boolean;
  typeOk: boolean;
  betterType: string;
  evidenceFaithful: boolean;
  verdict: "correct" | "minor" | "wrong";
  note: string;
};

function argv(flag: string): string | undefined {
  const i = process.argv.indexOf(flag);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

// ── 오류 주입 — 심판이 관대한지 재려면 정답을 아는 오류가 필요하다 ──
// 앱이 실제로 낸 오류(PIE-53)와 같은 모양으로 넣는다. 각 종류마다 "심판이 이걸 잡으면 성공"이
// 무엇인지 정해두고, 그 비율이 곧 그 유형에 대한 LLM 검출률이다.
const ASYM = ["part_of", "used_in", "causes", "solves", "prerequisite"];
const RETYPE: Record<string, string> = { part_of: "causes", used_in: "part_of", causes: "part_of", solves: "used_in", contrasts: "part_of", related_to: "causes", prerequisite: "part_of" };
// 원문에 없는 비유 — PIE-53 의 "화장실 문을 잠그는 뮤텍스" 사례를 이 코퍼스에서 재현한 것.
const FAKE_ANALOGY = "원문에서 이를 도서관 사서가 대출 장부에 도장을 찍는 과정에 빗대어 설명함.";

type Mutation = "reverse" | "retype" | "fakeEvidence" | "fakePair";

// 주입한 오류를 심판이 잡았다고 볼 조건.
function caught(kind: Mutation, j: Judgement): boolean {
  if (kind === "reverse") return !j.directionOk || j.verdict === "wrong";
  if (kind === "retype") return !j.typeOk || j.verdict !== "correct";
  if (kind === "fakeEvidence") return !j.evidenceFaithful || j.verdict !== "correct";
  return !j.supported || j.verdict === "wrong";
}

function mutate(kind: Mutation, items: Array<{ doc: string; r: Relation }>): Array<{ doc: string; r: Relation }> {
  if (kind === "reverse")
    return items
      .filter((it) => ASYM.includes(it.r.relationType))
      .map((it) => ({ doc: it.doc, r: { ...it.r, sourceConceptTitle: it.r.targetConceptTitle, targetConceptTitle: it.r.sourceConceptTitle } }));
  if (kind === "retype")
    return items
      .filter((it) => RETYPE[it.r.relationType])
      .map((it) => ({ doc: it.doc, r: { ...it.r, relationType: RETYPE[it.r.relationType] } }));
  if (kind === "fakeEvidence")
    return items.map((it) => ({
      doc: it.doc,
      r: { ...it.r, evidence: [{ sourceId: it.r.evidence?.[0]?.sourceId ?? "src-1", reason: FAKE_ANALOGY }] },
    }));
  // fakePair — 서로 다른 문서의 개념을 짝지어 그럴듯한 설명을 붙인다. 원문에 근거가 없다.
  const titles = [...new Set(items.flatMap((it) => [it.r.sourceConceptTitle, it.r.targetConceptTitle]))];
  const out: Array<{ doc: string; r: Relation }> = [];
  for (let i = 0; i + 1 < titles.length && out.length < 12; i += 3) {
    const a = titles[i];
    const b = titles[titles.length - 1 - i];
    if (a === b) continue;
    out.push({
      doc: items[0].doc,
      r: {
        sourceConceptTitle: a,
        targetConceptTitle: b,
        relationType: "used_in",
        confidence: 0.95,
        explanation: `${a}는 ${b}를 구현할 때 핵심 구성 요소로 활용된다.`,
        evidence: [{ sourceId: "src-1", reason: `원문에서 ${a}가 ${b} 안에서 쓰인다고 기술함.` }],
      },
    });
  }
  return out;
}

// 원문 발췌 — 두 개념이 함께 나오는 문단을 먼저, 없으면 각자 나오는 문단을 모은다.
function excerpt(paras: string[], a: string, b: string): string {
  const A = squash(a);
  const B = squash(b);
  const both = paras.filter((p) => squash(p).includes(A) && squash(p).includes(B));
  const only = paras.filter((p) => !both.includes(p) && (squash(p).includes(A) || squash(p).includes(B)));
  return [...both.slice(0, 4), ...only.slice(0, 6)].map((p) => p.slice(0, 600)).join("\n\n");
}

async function main() {
  const dir = argv("--dir");
  const run = argv("--run") ?? "run-0";
  const limit = Number(argv("--limit") ?? "0");
  // 심판 모델은 생성 모델과 분리해서 지정할 수 있다 — 자기 출력을 자기가 채점하는 편향을 피할 수 있고,
  // 무료 티어 일일 한도가 모델별로 걸려 있어 생성이 한도를 다 써도 심판은 돌릴 수 있다.
  const model = argv("--model") ?? GEMINI_MODEL;
  if (!dir) throw new Error("--dir 필요");
  const key = process.env.GEMINI_API_KEY?.trim();
  if (!key) throw new Error("GEMINI_API_KEY 없음");

  const gt = JSON.parse(readFileSync(join(dir, "ground-truth.json"), "utf-8")) as GroundTruth[];
  const paraByDoc = new Map<string, string[]>();
  const squashByDoc = new Map<string, string>();
  for (const g of gt) {
    const raw = readFileSync(join(dir, "input", g.file), "utf-8");
    paraByDoc.set(
      g.title,
      raw.split(/\n+/).map((p) => p.trim()).filter((p) => p.length > 30),
    );
    squashByDoc.set(g.title, squash(raw));
  }
  const allSquashed = [...squashByDoc.values()].join("\n");

  const rounds = JSON.parse(readFileSync(join(dir, "results", `${run}.json`), "utf-8")) as Round[];
  const items = rounds.flatMap((rd) => rd.raw.relations.map((r) => ({ doc: rd.doc, r })));
  const mutation = argv("--mutate") as Mutation | undefined;
  const base = mutation ? mutate(mutation, items) : items;
  const target = limit > 0 ? base.slice(0, limit) : base;
  // 결과 파일명에 심판 모델을 넣는다 — 같은 주입을 모델만 바꿔 돌리면 앞 결과가 지워진다.
  const short = model.replace(/^gemini-/, "");
  const tag = `${mutation ? `mut-${mutation}-` : ""}${run}-${short}`;
  if (mutation) console.log(`오류 주입: ${mutation} — 관계 ${target.length}건\n`);

  const out: Array<Record<string, unknown>> = [];
  for (const [i, it] of target.entries()) {
    const paras = paraByDoc.get(it.doc) ?? [];
    const ctx = excerpt(paras, it.r.sourceConceptTitle, it.r.targetConceptTitle);
    const body = JSON.stringify({
      model,
      messages: [
        {
          role: "system",
          content:
            "너는 지식 그래프 관계의 채점자다. 아래 원문 발췌만을 근거로 판정한다.\n" +
            "발췌에 근거가 없으면 supported=false 로 답한다. 상식으로 보충하지 마라.\n" +
            "quote 에는 원문 발췌에서 **그대로 복사한** 한 문장을 넣는다. 요약·재서술 금지. 근거가 없으면 빈 문자열.\n" +
            "directionOk 는 (source, target) 배정이 아래 타입 정의의 방향과 맞는지다.\n" +
            "typeOk 는 relationType 이 아래 정의에 비추어 적절한지다. 아니면 betterType 에 더 맞는 타입 하나.\n" +
            "evidenceFaithful 은 제시된 근거 문장이 원문 내용과 어긋나지 않는지다.\n" +
            "verdict: correct(그대로 써도 됨) / minor(타입이나 표현만 손보면 됨) / wrong(방향이 틀렸거나 원문에 없음).\n\n" +
            "관계 타입 정의:\n" +
            TYPE_TABLE,
        },
        {
          role: "user",
          content: JSON.stringify({
            relation: {
              source: it.r.sourceConceptTitle,
              relationType: it.r.relationType,
              target: it.r.targetConceptTitle,
              explanation: it.r.explanation,
              statedEvidence: it.r.evidence?.map((e) => e.reason) ?? [],
            },
            sourceExcerpt: ctx || "(발췌 없음)",
          }),
        },
      ],
      response_format: { type: "json_schema", json_schema: { name: "RelationJudgement", strict: false, schema: SCHEMA } },
    });

    let j: Judgement | null = null;
    try {
      // 무료 티어 429 는 초 단위로 풀린다 — 기본 250ms backoff 로는 재시도가 전부 같은 창에 몰린다.
      j = (await chatJsonWithRetry("judge", key, body, { maxRetries: 4, backoffMs: 3000 })) as Judgement;
    } catch (e) {
      console.log(`  ${i + 1}/${target.length} 실패 — ${e instanceof Error ? e.message : String(e)}`);
    }
    // 심판의 인용이 실제 원문에 있는가 — 심판 자신의 환각 검사.
    const q = j?.quote?.trim() ?? "";
    const quoteReal = q.length >= 8 ? allSquashed.includes(squash(q)) : null;

    out.push({
      run,
      doc: it.doc,
      source: it.r.sourceConceptTitle,
      type: it.r.relationType,
      target: it.r.targetConceptTitle,
      confidence: it.r.confidence,
      judgement: j,
      judgeQuoteReal: quoteReal,
      hadExcerpt: ctx.length > 0,
      judgeModel: model,
      mutation: mutation ?? null,
      caught: mutation && j ? caught(mutation, j) : null,
    });
    console.log(
      `  ${String(i + 1).padStart(3)}/${target.length}  ${j?.verdict ?? "ERR"}` +
        `${mutation && j ? (caught(mutation, j) ? " 잡음" : " 놓침") : ""}  ` +
        `${quoteReal === false ? "[심판인용 환각] " : ""}${it.r.sourceConceptTitle} ${it.r.relationType} ${it.r.targetConceptTitle}`,
    );
    writeFileSync(join(dir, "results", `judge-${tag}.json`), JSON.stringify(out, null, 2), "utf-8");
    await sleep(Number(process.env.JUDGE_GAP_MS ?? 4000)); // 무료 티어 RPM 여유 — 모델마다 창이 다르다
  }

  const done = out.filter((o) => o.judgement);
  const v = (name: string) => done.filter((o) => (o.judgement as Judgement).verdict === name).length;
  console.log(`\n판정 ${done.length}/${target.length}`);
  console.log(`  correct ${v("correct")} · minor ${v("minor")} · wrong ${v("wrong")}`);
  console.log(`  supported=false ${done.filter((o) => !(o.judgement as Judgement).supported).length}`);
  console.log(`  directionOk=false ${done.filter((o) => !(o.judgement as Judgement).directionOk).length}`);
  console.log(`  typeOk=false ${done.filter((o) => !(o.judgement as Judgement).typeOk).length}`);
  console.log(`  evidenceFaithful=false ${done.filter((o) => !(o.judgement as Judgement).evidenceFaithful).length}`);
  console.log(`  심판 인용이 원문에 없음 ${done.filter((o) => o.judgeQuoteReal === false).length}건 — 이만큼은 심판도 못 믿는다`);
  if (mutation) {
    const hit = done.filter((o) => caught(mutation, o.judgement as Judgement)).length;
    console.log(`
  주입 오류(${mutation}) 검출률: ${hit}/${done.length} (${done.length ? Math.round((hit / done.length) * 100) : 0}%)`);
  }
}

main();
