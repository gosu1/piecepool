// SSOT의 JSON Schema(§4)를 런타임 검증용 .json 아티팩트로 추출한다.
// 원본: docs/10-contracts/llm-output-schema.md — 본 스크립트는 그 문서를 그대로 따른다(복붙 금지, 추출만).
// 실행: npm run gen:llm-schema
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";

const SRC = "docs/10-contracts/llm-output-schema.md";
const OUT = "src/llm/schema/llm-wiki-result.schema.json";

const md = readFileSync(SRC, "utf8");
const block = md.match(/```json\n([\s\S]*?)\n```/);
if (!block) {
  console.error(`gen-llm-schema: no \`\`\`json block found in ${SRC}`);
  process.exit(1);
}

let schema;
try {
  schema = JSON.parse(block[1]);
} catch (e) {
  console.error(`gen-llm-schema: json block does not parse: ${e.message}`);
  process.exit(1);
}

if (schema.title !== "LlmWikiResult") {
  console.error(`gen-llm-schema: expected schema.title "LlmWikiResult", got "${schema.title}"`);
  process.exit(1);
}

const out = {
  $comment:
    "GENERATED from docs/10-contracts/llm-output-schema.md §4 by scripts/gen-llm-schema.mjs — do not edit by hand. Run: npm run gen:llm-schema",
  ...schema,
};

mkdirSync(dirname(OUT), { recursive: true });
writeFileSync(OUT, JSON.stringify(out, null, 2) + "\n", "utf8");
console.log(`gen-llm-schema: wrote ${OUT} (title=${schema.title})`);
