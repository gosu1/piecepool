// Semantic chunking — 원문을 의미 경계에서 자르는 전처리 (segmentation).
// SSOT 설계: docs/30-llm/README.md §C "의미적 경계".
//   1. 인접 문장 embedding → 2. 연속 문장 간 cosine similarity → 3. 유사도 급락 지점을 경계.
//   고정 절댓값 금지 → 적응형 percentile: 문서 내 인접 유사도 하위 N%에 드는 drop만 경계로 인정.
// 참고 구현: LangChain SemanticChunker(percentile breakpoint)와 동형. 의존성은 추가하지 않는다.
//
// embed는 주입형(EmbedFn) — provider(openai.ts)가 fetchFn을 주입하는 패턴과 동일하게,
// 테스트/오프라인에서 가짜 임베더를 넣을 수 있다. 실 임베더는 embeddings.ts가 제공.
// classify도 주입형(ClassifyFn) — 있으면 [B] 정보 유형을 조각별로 부여(classify.ts). 타입만 import(런타임 결합 없음).
import type { ClassifyFn, NodeType } from "./classify";

// texts → 각 text의 임베딩 벡터. 순서 보존.
export type EmbedFn = (texts: string[]) => Promise<number[][]>;

export interface Chunk {
  text: string;
  sentences: string[];
  start: number; // 문장 인덱스 (inclusive)
  end: number; // 문장 인덱스 (exclusive)
  nodeType?: NodeType; // [B] classify 주입 시 부여되는 정보 유형.
}

export interface SemanticChunkOptions {
  embed: EmbedFn;
  percentile?: number; // 하위 N% drop을 경계로 (기본 10). 실데이터로 튜닝하는 핵심 파라미터.
  minSentences?: number; // 이보다 작은 청크는 이전 청크에 병합 (기본 1 = 병합 안 함).
  classify?: ClassifyFn; // 있으면 각 청크에 nodeType 부여 ([C]→[B] 연결).
}

export interface SemanticChunkResult {
  chunks: Chunk[];
  sentences: string[];
  similarities: number[]; // 길이 = sentences.length - 1. 인접 문장 cosine 신호.
  threshold: number; // 이번에 적용된 percentile 임계값 (NaN = 경계 없음/문장 부족).
  boundaries: number[]; // 경계 인덱스 i = 문장 i 와 i+1 사이를 자름.
}

// 문장 분리 — 한국어/영어/마크다운 혼용 노트 대상. 줄 단위로 나눈 뒤 문장 종결부호로 재분리.
// 헤딩(#)·리스트(-,*,+,1.)·인용(>) 마커는 제거하고 텍스트만 문장으로 취급.
export function splitSentences(text: string): string[] {
  const normalized = text.replace(/\r\n/g, "\n");
  const out: string[] = [];
  for (const rawLine of normalized.split("\n")) {
    const line = rawLine.trim();
    if (!line) continue;
    const cleaned = line
      .replace(/^#{1,6}\s+/, "")
      .replace(/^>\s+/, "")
      .replace(/^[-*+]\s+/, "")
      .replace(/^\d+\.\s+/, "")
      .trim();
    if (!cleaned) continue;
    // 종결부호(. ! ? 。 ！ ？ …)를 포함해 문장 단위로 분할.
    const parts = cleaned.match(/[^.!?。！？…]+[.!?。！？…]*/g) ?? [cleaned];
    for (const p of parts) {
      const s = p.trim();
      if (s) out.push(s);
    }
  }
  return out;
}

// cosine similarity. OpenAI 임베딩은 이미 단위벡터라 dot과 같지만, 주입 임베더 대비 정식 계산.
export function cosine(a: number[], b: number[]): number {
  let dot = 0;
  let na = 0;
  let nb = 0;
  const n = Math.min(a.length, b.length);
  for (let i = 0; i < n; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  const denom = Math.sqrt(na) * Math.sqrt(nb);
  return denom === 0 ? 0 : dot / denom;
}

// 오름차순 정렬된 값 배열에서 pct(0~100) 백분위 값. 선형 보간.
export function percentile(sortedAsc: number[], pct: number): number {
  if (sortedAsc.length === 0) return NaN;
  if (sortedAsc.length === 1) return sortedAsc[0];
  const clamped = Math.min(100, Math.max(0, pct));
  const idx = (clamped / 100) * (sortedAsc.length - 1);
  const lo = Math.floor(idx);
  const hi = Math.ceil(idx);
  if (lo === hi) return sortedAsc[lo];
  const frac = idx - lo;
  return sortedAsc[lo] * (1 - frac) + sortedAsc[hi] * frac;
}

// 메인: 원문 → 의미 청크. 문장 0~1개면 통째로 1청크.
export async function semanticChunk(
  text: string,
  opts: SemanticChunkOptions,
): Promise<SemanticChunkResult> {
  const pct = opts.percentile ?? 10;
  const minSentences = Math.max(1, opts.minSentences ?? 1);

  const sentences = splitSentences(text);
  if (sentences.length <= 1) {
    const chunks0 = sentences.length ? [makeChunk(sentences, 0, sentences.length)] : [];
    return {
      chunks: applyTypes(chunks0, opts.classify),
      sentences,
      similarities: [],
      threshold: NaN,
      boundaries: [],
    };
  }

  const vectors = await opts.embed(sentences);
  if (vectors.length !== sentences.length) {
    throw new Error(`embed 반환 개수 불일치: 문장 ${sentences.length} vs 벡터 ${vectors.length}`);
  }

  // 인접 문장 간 유사도 신호.
  const similarities: number[] = [];
  for (let i = 0; i < sentences.length - 1; i++) {
    similarities.push(cosine(vectors[i], vectors[i + 1]));
  }

  // 적응형 임계값: 유사도 하위 N% 백분위. 신호가 이보다 낮으면(급락) 경계.
  // LangChain SemanticChunker와 동일하게 strict '<' — 임계값 동률은 경계로 치지 않음(과분할 억제).
  const threshold = percentile([...similarities].sort((x, y) => x - y), pct);
  const boundaries: number[] = [];
  for (let i = 0; i < similarities.length; i++) {
    if (similarities[i] < threshold) boundaries.push(i);
  }

  const chunks = enforceMinSentences(groupByBoundaries(sentences, boundaries), minSentences);
  return { chunks: applyTypes(chunks, opts.classify), sentences, similarities, threshold, boundaries };
}

// classify 주입 시 각 청크에 nodeType 부여. 없으면 그대로.
function applyTypes(chunks: Chunk[], classify?: ClassifyFn): Chunk[] {
  if (!classify) return chunks;
  return chunks.map((c) => ({ ...c, nodeType: classify(c.text) }));
}

// 경계 인덱스로 문장을 청크로 묶는다. boundary i = 문장 i 다음에서 자름.
function groupByBoundaries(sentences: string[], boundaries: number[]): Chunk[] {
  const cut = new Set(boundaries);
  const chunks: Chunk[] = [];
  let start = 0;
  for (let i = 0; i < sentences.length; i++) {
    if (cut.has(i) || i === sentences.length - 1) {
      chunks.push(makeChunk(sentences, start, i + 1));
      start = i + 1;
    }
  }
  return chunks;
}

// minSentences 미만 청크는 이전 청크에 병합(첫 청크면 다음 청크로 이월). trivial 노드 폭발 억제(README §A).
function enforceMinSentences(chunks: Chunk[], minSentences: number): Chunk[] {
  if (minSentences <= 1 || chunks.length <= 1) return chunks;
  const merged: Chunk[] = [];
  for (const c of chunks) {
    const prev = merged[merged.length - 1];
    if (prev && (prev.sentences.length < minSentences || c.sentences.length < minSentences)) {
      // makeChunk 는 전역 문장 배열 기준 slice 라 여기선 못 쓴다 — 로컬 병합 배열에 전역 인덱스를
      // 넘기면 prev.start 만큼 앞 문장이 잘려나간다. span(start/end)은 전역 인덱스로 유지한다.
      const s = [...prev.sentences, ...c.sentences];
      merged[merged.length - 1] = { text: s.join(" "), sentences: s, start: prev.start, end: c.end };
    } else {
      merged.push(c);
    }
  }
  return merged;
}

function makeChunk(sentences: string[], start: number, end: number): Chunk {
  const slice = sentences.slice(start, end);
  return { text: slice.join(" "), sentences: slice, start, end };
}
