// [B] 정보 유형 분류 미리보기 — 문장별 타입 + 판정 근거 + 히스토그램.
// 실행(tsx, devDep):
//   npm run classify -- --file path/to/note.md
//   npm run classify -- --fixture case-001-self-attention
//   npm run classify -- --text "스택은 LIFO 자료구조다. 먼저 push하고 그다음 pop한다."
//
// 문장 분리는 chunk.ts splitSentences 재사용. 코어: src/llm/classify.ts. SSOT 설계: docs/30-llm/README.md §B.

import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { splitSentences } from "../src/llm/chunk";
import { explain, type NodeType } from "../src/llm/classify";

const FIXTURES_DIR = join(dirname(fileURLToPath(import.meta.url)), "..", "docs/30-llm/evals/fixtures");
const TYPES: NodeType[] = ["concept", "fact", "claim", "example", "method", "question"];

function main(): void {
  const args = process.argv.slice(2);
  const get = (flag: string): string | undefined => {
    const i = args.indexOf(flag);
    return i !== -1 ? args[i + 1] : undefined;
  };

  const text = loadText(get);
  if (!text.trim()) return fail("입력이 비었다. --file | --fixture | --text 중 하나 필요");

  const sentences = splitSentences(text);
  console.log(`\n=== Node Type Classify Preview ===\n문장: ${sentences.length}개\n`);

  const hist: Record<NodeType, number> = { concept: 0, fact: 0, claim: 0, example: 0, method: 0, question: 0 };
  for (const s of sentences) {
    const { type, reason } = explain(s);
    hist[type]++;
    const preview = s.length > 70 ? s.slice(0, 70) + "…" : s;
    console.log(`  [${type.padEnd(8)}] ${preview}   (${reason})`);
  }

  console.log(`\n── 분포 ──`);
  for (const t of TYPES) console.log(`  ${t.padEnd(9)} ${hist[t]}`);
  console.log("");
}

function loadText(get: (f: string) => string | undefined): string {
  const file = get("--file");
  if (file) return readFileSync(file, "utf-8");
  const fixture = get("--fixture");
  if (fixture) {
    const fx = JSON.parse(readFileSync(join(FIXTURES_DIR, `${fixture}.json`), "utf-8")) as { input?: { sourceText?: string } };
    return fx.input?.sourceText ?? "";
  }
  return get("--text") ?? "";
}

function fail(msg: string): void {
  console.error(msg);
  process.exit(1);
}

main();
