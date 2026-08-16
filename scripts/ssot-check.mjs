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

// 문서: docs/ (계약·archive 제외) + 루트 CLAUDE.md, README.md
const mdFiles = all.filter(
  (f) =>
    f.endsWith(".md") &&
    ((f.startsWith("docs/") &&
      !f.startsWith("docs/10-contracts/") &&
      !f.startsWith("docs/archive/")) ||
      f === "CLAUDE.md" ||
      f === "README.md"),
);

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

  // 1. md 안의 TS 타입/인터페이스 정의 (종전 검사 계승 + interface 추가)
  if (/^(export )?(type|interface) [A-Z]\w*\s*(=|\{)/m.test(s))
    violations.push({ rule: "md-typedef", file: f, detail: "TS 타입 정의가 문서 안에 있음" });

  // 2. md 안의 JSON Schema (종전 검사 계승)
  if (/"\$schema":/.test(s))
    violations.push({ rule: "md-jsonschema", file: f, detail: "JSON Schema 정의가 문서 안에 있음" });

  // 3. RelationType 값 나열 — 백틱·따옴표·맨몸 전부. 12종 중 6종 이상이면 목록 복사로 본다.
  //    (본문에서 한두 개 언급하는 것은 정상 참조라 통과)
  const found = RELATION_TYPES.filter((v) => s.includes(v));
  if (found.length >= 6)
    violations.push({ rule: "md-relation-enum", file: f, detail: `RelationType ${found.length}/12종 나열` });

  // 4. 워크스페이스 폴더 트리 복사 — <space>/ 하위 경로가 3종 이상 등장하면 트리를 옮긴 것
  const subdirs = new Set([...s.matchAll(/<space>\/([a-z-]+)\//g)].map((m) => m[1]));
  if (s.includes("workspaceRoot")) subdirs.add(".config");
  if (subdirs.size >= 3)
    violations.push({ rule: "md-tree-copy", file: f, detail: `폴더 트리 ${subdirs.size}개 경로 복사` });
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
const baseSet = new Set(baseline.map(key));
const violSet = new Set(violations.map(key));

const fresh = violations.filter((v) => !baseSet.has(key(v)));
const grandfathered = violations.filter((v) => baseSet.has(key(v)));
const stale = baseline.filter((b) => !violSet.has(key(b)));

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
  console.log(`\nSSOT clean — 신규 위반 0건 (베이스라인 잔여 ${grandfathered.length}건, 스캔 md ${mdFiles.length} / ts ${tsFiles.length} / rs ${rsFiles.length})`);
process.exit(failed ? 1 : 0);
