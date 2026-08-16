// SSOT 누출 검사 — docs/10-contracts/ 밖에 계약 내용이 복사됐는지 찾는다.
// 실행: node scripts/ssot-check.mjs  (CI docs-check 의 ssot-check job 이 호출)
//
// 종전 grep 방식은 복붙을 0건 잡았다 (PIE-5 조사): 따옴표 패턴만 보는데 문서는
// 백틱을 쓰고, docs/ 만 스캔해 루트의 CLAUDE.md 가 빠졌고, 걸려도 warning 이라
// 아무것도 막지 않았다. 본 스크립트가 그 세 구멍을 막는다.
//
// 베이스라인 래칫 (scripts/ssot-baseline.json):
// - 이미 존재하던 위반은 베이스라인에 등재돼 있어 경고만 하고 통과시킨다.
//   (즉시 차단하면 정리 전까지 모든 문서 PR 이 빨개진다.)
// - 새 위반은 즉시 실패시킨다.
// - 베이스라인에 있는데 더 이상 위반이 아니면 그것도 실패다 — 정리한 PR 에서
//   베이스라인 항목을 같이 지워야 한다. 목록은 줄어들기만 한다.
// - 베이스라인(고칠 빚)과 별개로, 판단이 끝난 정당 사용은 ALLOWED 에 사유와 함께
//   등재한다 — notice 만 찍고 통과. PIE-70 정리로 베이스라인은 0건이 됐다.

import { readFileSync, readdirSync, existsSync } from "node:fs";
import { join } from "node:path";

const BASELINE_PATH = "scripts/ssot-baseline.json";

const RELATION_TYPES = [
  "extracted_from", "explained_by", "prerequisite", "part_of", "used_in",
  "causes", "solves", "contrasts", "confused_with", "related_to",
  "tested_in", "review_needed",
];

const ENTITY_NAMES = [
  "Workspace", "KnowledgeSpace", "Subject", "Source", "ArchiveNote",
  "Concept", "WikiPage", "SourceRef", "Evidence", "Question", "ImportJob",
];

// 계약(10-contracts)이 정의하는 타입 이름 전체 — md 재정의 검사용
const CONTRACT_TYPE_NAMES = [
  ...ENTITY_NAMES,
  "SourceType", "RelationType", "ImportJobStatus", "Relation",
  "LlmWikiResult", "LlmConcept", "LlmRelation", "LlmEvidence", "LlmSourceRef",
];

// ── 파일 수집 ────────────────────────────────────────────────
function walk(dir, out = []) {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name).split("\\").join("/");
    if (e.isDirectory()) {
      if (["node_modules", ".git", "target", "dist", "coverage"].includes(e.name)) continue;
      walk(p, out);
    } else out.push(p);
  }
  return out;
}

const all = walk(".").map((p) => p.replace(/^\.\//, ""));

// 문서: docs/ (계약·archive·superpowers 제외) + 루트 CLAUDE.md, README.md
// superpowers 는 날짜 박힌 설계 기록(과거 제안서)이라 archive 와 동급으로 제외한다 —
// 고치면 역사 왜곡이고, 살아 있는 문서가 아니라 복사 드리프트 위험도 없다 (PIE-70 판단).
const mdFiles = all.filter(
  (f) =>
    f.endsWith(".md") &&
    ((f.startsWith("docs/") &&
      !f.startsWith("docs/10-contracts/") &&
      !f.startsWith("docs/archive/") &&
      !f.startsWith("docs/superpowers/")) ||
      f === "CLAUDE.md" ||
      f === "README.md"),
);

// 판단이 끝난 정당 사용 — 베이스라인(고칠 빚)과 달리 여기는 사유가 확정된 예외다 (PIE-70).
// 항목을 추가하려면 사유를 함께 적을 것. 계약이 바뀌면 이 파일들도 손봐야 한다.
const ALLOWED = [
  { rule: "md-relation-enum", file: "docs/30-llm/skill-export.md",
    why: "에이전트 프롬프트 원문 — 기능상 12종 목록이 프롬프트 안에 있어야 함. 계약 변경 시 동기화" },
  { rule: "md-tree-copy", file: "docs/30-llm/skill-export.md",
    why: "동일 프롬프트 원문 — 검색 순서에 경로 나열 필요" },
  { rule: "md-relation-enum", file: "docs/40-frontend/graph-view.md",
    why: "타입→렌더 스타일 매핑(파생 명세). 정의 복사가 아니라 타입명을 키로 쓰는 표" },
];

// 소스: TS(생성물 제외) + Rust(models/ 는 계약의 공식 손번역처라 제외)
const tsFiles = all.filter(
  (f) => /^src\/.*\.(ts|tsx)$/.test(f) && !f.startsWith("src/lib/generated/"),
);
const rsFiles = all.filter(
  (f) => /^src-tauri\/src\/.*\.rs$/.test(f) && !f.startsWith("src-tauri/src/models/"),
);

// ── 규칙 ────────────────────────────────────────────────────
const violations = []; // { rule, file, detail }

for (const f of mdFiles) {
  const s = readFileSync(f, "utf8");

  // 1. md 안에서 계약이 정의한 타입을 재정의 — 복사 금지의 대상은 "계약 내용"이다.
  //    새 타입 제안·어댑터 인터페이스(예: provider-config.md 의 LlmWikiInput — 계약이
  //    "Adapter 인터페이스" 로 명시 위임한 원본 정의)는 복사가 아니므로 잡지 않는다 (PIE-70 판단).
  const mdContractDef = new RegExp(`^(export )?(type|interface) (${CONTRACT_TYPE_NAMES.join("|")})\\b`, "m");
  const mdTypeMatch = s.match(mdContractDef);
  if (mdTypeMatch)
    violations.push({ rule: "md-typedef", file: f, detail: `계약 타입 ${mdTypeMatch[3]} 재정의` });

  // 2. md 안의 JSON Schema (종전 검사 계승)
  if (/"\$schema":/.test(s))
    violations.push({ rule: "md-jsonschema", file: f, detail: "JSON Schema 정의가 문서 안에 있음" });

  // 3. RelationType 12종 전부 나열 = 목록 복사. 일부 언급(사용 지침·예시)은 정상 참조다 —
  //    실측상 6~11종 사례는 전부 정당 사용(prompt-templates 의 사용 규칙 등)이었다 (PIE-70 판단).
  const found = RELATION_TYPES.filter((v) => s.includes(v));
  if (found.length === RELATION_TYPES.length)
    violations.push({ rule: "md-relation-enum", file: f, detail: `RelationType ${found.length}/12종 전체 나열` });

  // 4. 워크스페이스 폴더 트리 복사 — 코드펜스 안에 트리를 그려 넣은 것만 잡는다.
  //    프로즈·표에서 저장 위치를 참조하는 것("원문 → <space>/archive/*.md")은 정당하다 (PIE-70 판단).
  const fenceTreeLines = [...s.matchAll(/```[^\n]*\n([\s\S]*?)```/g)]
    .map((m) => m[1].split("\n").filter((l) => /<space>\/[a-z-]+\/|workspaceRoot/.test(l)).length)
    .reduce((a, b) => Math.max(a, b), 0);
  if (fenceTreeLines >= 3)
    violations.push({ rule: "md-tree-copy", file: f, detail: `코드블록 안 폴더 트리 ${fenceTreeLines}줄 복사` });
}

// 5. 소스 안의 계약 엔티티 타입 재정의 — 엔티티는 generated/(TS)·models/(Rust)에서만 온다
const entityAlt = ENTITY_NAMES.join("|");
const tsEntityDef = new RegExp(`^(export )?(type|interface) (${entityAlt})\\s*(=|\\{|<)`, "m");
const rsEntityDef = new RegExp(`^pub (struct|enum) (${entityAlt})\\b`, "m");

for (const f of tsFiles) {
  const s = readFileSync(f, "utf8");
  const m = s.match(tsEntityDef);
  if (m) violations.push({ rule: "src-entity-typedef", file: f, detail: `계약 엔티티 ${m[3]} 재정의` });
}
for (const f of rsFiles) {
  const s = readFileSync(f, "utf8");
  const m = s.match(rsEntityDef);
  if (m) violations.push({ rule: "src-entity-typedef", file: f, detail: `계약 엔티티 ${m[2]} 재정의` });
}

// ── 베이스라인 대조 ──────────────────────────────────────────
const baseline = existsSync(BASELINE_PATH)
  ? JSON.parse(readFileSync(BASELINE_PATH, "utf8"))
  : [];
const key = (v) => `${v.rule}\u0000${v.file}`;
const allowedSet = new Set(ALLOWED.map(key));
const allowed = violations.filter((v) => allowedSet.has(key(v)));
const violationsLeft = violations.filter((v) => !allowedSet.has(key(v)));

const baseSet = new Set(baseline.map(key));
const violSet = new Set(violationsLeft.map(key));

const fresh = violationsLeft.filter((v) => !baseSet.has(key(v)));
const grandfathered = violationsLeft.filter((v) => baseSet.has(key(v)));
const stale = baseline.filter((b) => !violSet.has(key(b)));

for (const v of allowed)
  console.log(`::notice file=${v.file}::[정당 사용] ${v.rule}: ${ALLOWED.find((a) => key(a) === key(v)).why}`);

for (const v of grandfathered)
  console.log(`::warning file=${v.file}::[베이스라인] ${v.rule}: ${v.detail} — 정리 시 ${BASELINE_PATH} 에서 제거`);

let failed = false;
if (fresh.length) {
  failed = true;
  console.log(`\n새 SSOT 위반 ${fresh.length}건 — 계약 내용은 docs/10-contracts/ 링크로만 참조한다:`);
  for (const v of fresh) console.log(`::error file=${v.file}::${v.rule}: ${v.detail}`);
}
if (stale.length) {
  failed = true;
  console.log(`\n베이스라인이 낡았다 ${stale.length}건 — 위반이 사라졌으니 ${BASELINE_PATH} 에서 지울 것:`);
  for (const b of stale) console.log(`::error file=${BASELINE_PATH}::${b.rule}: ${b.file}`);
}

if (!failed)
  console.log(`\nSSOT clean — 신규 위반 0건 (베이스라인 잔여 ${grandfathered.length}건, 정당 사용 ${allowed.length}건, 스캔 md ${mdFiles.length} / ts ${tsFiles.length} / rs ${rsFiles.length})`);
process.exit(failed ? 1 : 0);
