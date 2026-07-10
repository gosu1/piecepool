// Semantic chunking 튜닝 하니스 — percentile N%를 실데이터로 조정하는 미리보기 도구.
// 실행(tsx, devDep):
//   npm run chunk -- --file path/to/note.md
//   npm run chunk -- --fixture case-001-self-attention
//   npm run chunk -- --text "문장1. 문장2. ..." --percentiles 5,10,15,20 --min 2
//   npm run chunk -- --file note.md --offline      # 키 없이 배관 스모크(비의미 lexical 임베딩)
//
// 여러 percentile 값에서 경계·청크·유사도 신호를 한 번에 보여줘 N%를 눈으로 고르게 한다.
// 임베딩은 문장당 1회만 호출(캐시) — percentile만 바꿔 재계산.
// SSOT 설계: docs/30-llm/README.md §C. 코어 로직: src/llm/chunk.ts.

import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { semanticChunk, splitSentences, percentile, type EmbedFn } from "../src/llm/chunk";
import { createGeminiEmbedder } from "../src/llm/embeddings";
import { classify } from "../src/llm/classify";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const FIXTURES_DIR = join(ROOT, "docs/30-llm/evals/fixtures");

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const get = (flag: string): string | undefined => {
    const i = args.indexOf(flag);
    return i !== -1 ? args[i + 1] : undefined;
  };
  const has = (flag: string) => args.includes(flag);

  const text = loadText(get, has);
  if (!text.trim()) return fail("입력 텍스트가 비었다. --file | --fixture | --text 중 하나 필요");

  const percentiles = (get("--percentiles") ?? "5,10,15,20")
    .split(",")
    .map((s) => Number(s.trim()))
    .filter((n) => Number.isFinite(n));
  const minSentences = Number(get("--min") ?? "1") || 1;

  // 키는 env 에서 읽는다(CLI 규약). 앱은 설정 모달의 localStorage 를 쓴다 — 둘은 별개다.
  const offline = has("--offline") || !readEnv().GEMINI_API_KEY;
  const embed = offline ? offlineLexicalEmbed : cache(createGeminiEmbedder());

  const sentences = splitSentences(text);
  const model = readEnv().PIECEPOOL_EMBED_MODEL || "gemini-embedding-001";
  console.log(`\n=== Semantic Chunk Preview ===`);
  console.log(`문장: ${sentences.length}개 | 임베딩: ${offline ? "offline lexical(비의미, 스모크용)" : model}`);
  if (sentences.length <= 1) return void console.log("문장이 1개 이하 — 청킹 불가.");

  // 유사도 신호는 percentile과 무관하므로 1회 계산해 분포를 먼저 보여준다.
  const base = await semanticChunk(text, { embed, percentile: 100 });
  printSignal(base.similarities);
  const sorted = [...base.similarities].sort((a, b) => a - b);
  console.log(
    `유사도 분포: min ${fmt(sorted[0])} | p25 ${fmt(percentile(sorted, 25))} | median ${fmt(percentile(sorted, 50))} | max ${fmt(sorted[sorted.length - 1])}`,
  );

  for (const pct of percentiles) {
    const r = await semanticChunk(text, { embed, percentile: pct, minSentences, classify });
    console.log(`\n── percentile ${pct}% (threshold ${fmt(r.threshold)}) → ${r.chunks.length} chunk / 경계 ${r.boundaries.length}개 ──`);
    r.chunks.forEach((c, i) => {
      const preview = c.text.length > 90 ? c.text.slice(0, 90) + "…" : c.text;
      console.log(`  [${i + 1}] (문장 ${c.sentences.length} · ${c.nodeType ?? "?"}) ${preview}`);
    });
  }
  console.log("");
}

function loadText(get: (f: string) => string | undefined, has: (f: string) => boolean): string {
  const file = get("--file");
  if (file) return readFileSync(file, "utf-8");
  const fixture = get("--fixture");
  if (fixture) {
    const fx = JSON.parse(readFileSync(join(FIXTURES_DIR, `${fixture}.json`), "utf-8")) as {
      input?: { sourceText?: string };
    };
    return fx.input?.sourceText ?? "";
  }
  const text = get("--text");
  if (text) return text;
  void has;
  return "";
}

// 유사도 신호를 한 줄 게이지로. 낮을수록(경계 후보) 눈에 띄게.
function printSignal(sims: number[]): void {
  const bars = sims.map((s) => "▁▂▃▄▅▆▇█"[Math.min(7, Math.max(0, Math.floor(s * 8)))]);
  console.log(`인접 유사도: ${bars.join("")}`);
}

// 임베딩 캐시 — 동일 texts 배열 재요청 시 API 재호출 방지(percentile 반복용).
function cache(inner: EmbedFn): EmbedFn {
  const store = new Map<string, number[][]>();
  return async (texts) => {
    const key = JSON.stringify(texts);
    const hit = store.get(key);
    if (hit) return hit;
    const v = await inner(texts);
    store.set(key, v);
    return v;
  };
}

// 오프라인 스모크용 결정적 lexical 임베딩 — 토큰 해시 bag-of-words. 의미 아님(경고 표기).
const offlineLexicalEmbed: EmbedFn = async (texts) =>
  texts.map((t) => {
    const dim = 256;
    const v = new Array(dim).fill(0);
    for (const tok of t.toLowerCase().split(/[^\p{L}\p{N}]+/u)) {
      if (!tok) continue;
      let h = 0;
      for (let i = 0; i < tok.length; i++) h = (h * 31 + tok.charCodeAt(i)) >>> 0;
      v[h % dim] += 1;
    }
    return v;
  });

function readEnv(): Record<string, string | undefined> {
  const g = globalThis as { process?: { env?: Record<string, string | undefined> } };
  return g.process?.env ?? {};
}

function fmt(n: number): string {
  return Number.isFinite(n) ? n.toFixed(3) : "n/a";
}

function fail(msg: string): void {
  console.error(msg);
  process.exit(1);
}

main().catch((e) => {
  console.error("예기치 않은 오류:", e);
  process.exit(1);
});
