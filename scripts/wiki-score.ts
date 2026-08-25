// 위키백과 실험 채점 — wiki-experiment.ts 의 out/rounds.json 을 정답지 대비로 읽는다.
//
// 정답지 3종 (전부 위키백과 편집자가 이미 내린 판정):
//   본문 [[링크]]  → "이건 별도 문서 자격이 있다". 우리 3테스트의 독립/이름 대응물.
//   걸침 횟수      → 몇 개 문서의 본문에서 불렸나. 반복 테스트의 대응물(논리 아닌 실측).
//   리다이렉트     → "이 표기들은 같은 개념". normalizeTitle dedup 의 대응물.
//
// 실행: npm run wiki-score -- --dir <수집디렉토리>

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { normalizeTitle } from "../src/lib/llmApply";

type GroundTruth = { order: number; title: string; bodyLinks: string[]; redirects: string[] };
type Round = {
  round: number;
  doc: string;
  concepts: string[];
  newTitles: string[];
  merged: number;
  relations: [string, string, string][];
  relatedToRatio: number;
  promote: { stats: Record<string, number>; degrees: [string, number, string][] };
  pagesSnapshot: { title: string; sourceIds: string[]; firstRound: number }[];
};

function argDir(): string {
  const i = process.argv.indexOf("--dir");
  if (i < 0 || !process.argv[i + 1]) throw new Error("--dir <수집디렉토리> 필요");
  return process.argv[i + 1];
}

function pct(n: number, d: number): string {
  return d === 0 ? "—" : `${((n / d) * 100).toFixed(0)}%`;
}

const dir = argDir();
const gt = JSON.parse(readFileSync(join(dir, "ground-truth.json"), "utf-8")) as GroundTruth[];
const rounds = JSON.parse(readFileSync(join(dir, "out/rounds.json"), "utf-8")) as Round[];

// 리다이렉트 → 정본 제목. 위키백과가 "같은 개념"이라 판정해둔 것을 매칭에 반영한다.
const canon = new Map<string, string>();
for (const g of gt) {
  canon.set(normalizeTitle(g.title), normalizeTitle(g.title));
  for (const r of g.redirects) canon.set(normalizeTitle(r), normalizeTitle(g.title));
}
// 위키백과 제목은 동음이의 해소를 위해 "자율 학습 (기계 학습)" 처럼 괄호 접미사를 단다.
// 앱은 접미사 없는 "자율 학습" 을 뽑으므로, 접미사를 떼고도 한 번 맞춰본다.
const bare = (t: string) => normalizeTitle(t).replace(/\s*\([^)]*\)\s*$/, "");
const key = (t: string) => canon.get(normalizeTitle(t)) ?? canon.get(bare(t)) ?? bare(t);

// 정답지 A — 문서별 본문링크 집합.
const linksOf = new Map<number, Set<string>>();
for (const g of gt) linksOf.set(g.order - 1, new Set(g.bodyLinks.map(key)));

// 정답지 B — 링크가 몇 개 문서의 본문에 걸쳐 나오나.
const spread = new Map<string, number>();
for (const g of gt) for (const l of new Set(g.bodyLinks.map(key))) spread.set(l, (spread.get(l) ?? 0) + 1);

console.log("═══ 1. 개념 추출 vs 위키백과 본문링크 ═══\n");
console.log("라운드  문서                  개념  신규  병합  링크일치  관계  related_to");
let totC = 0, totHit = 0;
for (const r of rounds) {
  const links = linksOf.get(r.round) ?? new Set();
  const hit = r.concepts.filter((c) => links.has(key(c))).length;
  totC += r.concepts.length;
  totHit += hit;
  console.log(
    `  R${r.round}   ${r.doc.padEnd(20)}  ${String(r.concepts.length).padStart(3)}   ${String(r.newTitles.length).padStart(3)}   ${String(r.merged).padStart(3)}   ` +
      `${String(hit).padStart(3)} ${pct(hit, r.concepts.length).padStart(5)}  ${String(r.relations.length).padStart(4)}  ${(r.relatedToRatio * 100).toFixed(0)}%`,
  );
}
console.log(`\n  전체 개념 ${totC}개 중 위키백과 본문링크와 일치 ${totHit}개 (${pct(totHit, totC)})`);
console.log("  * 불일치가 곧 오답은 아니다 — 위키백과가 본문에 둔 것(08장 「노드 대신 본문」)일 수 있다.\n");

const last = rounds[rounds.length - 1];

console.log("═══ 2. 반복 테스트 — 정답지(걸침) vs 우리(sourceIds) ═══\n");
const ours = new Map<string, number>();
for (const p of last.pagesSnapshot) ours.set(key(p.title), p.sourceIds.length);
const multiGt = [...spread.entries()].filter(([, n]) => n >= 2).sort((a, b) => b[1] - a[1]);
console.log(`  위키백과 기준 2개 이상 문서에 걸친 개념: ${multiGt.length}개`);
console.log(`  우리 sourceIds 2개 이상: ${[...ours.values()].filter((n) => n >= 2).length}개 / 총 ${ours.size}장\n`);
console.log("  개념                        위키백과걸침  우리sourceIds");
for (const [k, n] of multiGt.slice(0, 15)) {
  const o = ours.get(k);
  const mark = o === undefined ? "미추출" : o >= 2 ? `${o} ✅` : `${o} ❌`;
  console.log(`  ${k.padEnd(28)}${String(n).padStart(6)}장      ${mark}`);
}

console.log("\n═══ 3. dedup — 리다이렉트로 같다고 판정된 것이 갈렸나 ═══\n");
const byCanon = new Map<string, string[]>();
for (const p of last.pagesSnapshot) {
  const k = key(p.title);
  if (!byCanon.has(k)) byCanon.set(k, []);
  byCanon.get(k)!.push(p.title);
}
const split = [...byCanon.entries()].filter(([, v]) => v.length > 1);
if (split.length === 0) console.log("  위키백과 리다이렉트 기준으로 갈린 페이지 없음.");
else for (const [k, v] of split) console.log(`  ${k} ← ${v.join(" / ")}  (${v.length}장으로 갈림)`);

console.log("\n═══ 4. 상태 머신 (round 실제 증가) ═══\n");
console.log("라운드  active  staging  archived");
for (const r of rounds) {
  const s = r.promote.stats;
  console.log(`  R${r.round}   ${String(s.active).padStart(5)}   ${String(s.staging).padStart(6)}   ${String(s.archived).padStart(7)}`);
}
const isolated = last.promote.degrees.filter(([, d]) => d === 0);
console.log(`\n  최종 고립(degree 0): ${isolated.length}개`);
if (isolated.length) console.log("  " + isolated.slice(0, 12).map(([id]) => id.replace(/^concept-/, "")).join(", "));

console.log("\n═══ 5. 개체 후보 — 사람이 볼 것 ═══\n");
console.log("  본문링크에 없고 관계도 안 붙은 개념 (04장 「구멍」 대응):");
const linkedAll = new Set([...linksOf.values()].flatMap((s) => [...s]));
const deg = new Map(last.promote.degrees.map(([id, d]) => [id, d]));
const cands = last.pagesSnapshot.filter(
  (p) => !linkedAll.has(key(p.title)) && (deg.get(`concept-${normalizeTitle(p.title)}`) ?? 0) === 0,
);
console.log(cands.length ? "  " + cands.map((p) => p.title).join(", ") : "  없음");
