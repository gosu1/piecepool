import type { LlmProvider, LlmWikiInput, LlmWikiResult, LlmConcept, LlmRelation } from "./provider";
import { GeminiProvider } from "./gemini";
import { semanticChunk, type EmbedFn, type Chunk } from "./chunk";
import { mergeDuplicateConcepts } from "./dedupConcepts";
import { createGeminiEmbedder } from "./embeddings";
import { promote } from "./promote";
import { classify, type NodeType } from "./classify";
import { getOutputLanguage, type OutputLanguage } from "./language";
import { errMsg } from "./http";
import { normalizeTitle } from "../lib/normalizeTitle";

// LLM 위키 생성 오케스트레이션 (README §LLM ①).
//  - apiKey 있으면 Gemini(OpenAI 호환 Chat Completions, 구조화 출력) 호출.
//  - 없거나 실패하면 노트를 헤딩 단위 개념으로 쪼개는 휴리스틱으로 폴백 → 키 없이도 동작.
//  - [C] semantic chunking(opt-in) + [E] promotion 연결성 게이트(항상, advisory) 연결. SSOT: docs/30-llm/README.md §C·§E.

export interface WikiGenResult {
  result: LlmWikiResult;
  engine: "gemini" | "heuristic";
  warning?: string;
  promotion?: PromotionReport; // [E] 이번 추출 그래프의 연결성 게이트 리포트(비파괴 advisory).
  chunks?: number; // [C] 청킹으로 처리한 조각 수(청킹 켰을 때만).
  nodeTypes?: Partial<Record<NodeType, number>>; // [B] 조각별 정보 유형 분포(청킹 켰을 때만).
}

// [E] 연결성 게이트 결과 — round=0 단발 추출이라 고립=staging, 연결=active만(archive는 다라운드 persistence 몫).
export interface PromotionReport {
  active: number;
  staging: number; // 이번 추출에서 어디에도 연결 안 된 개념 수
  isolatedTitles: string[];
}

export interface WikiGenOptions {
  chunk?: {
    enabled?: boolean; // 기본 false — 끄면 기존 단일 호출과 동일(비용/동작 불변).
    percentile?: number; // 의미 경계 하위 N%(chunk.ts). 실데이터로 튜닝.
    minSentences?: number;
    maxChunks?: number; // 조각별 호출 상한(비용 방어, 기본 12). 초과분은 로그 후 절단.
    embed?: EmbedFn; // 주입(테스트/대체). 기본 createGeminiEmbedder(apiKey).
  };
  provider?: LlmProvider; // 주입(테스트/대체). 기본 new GeminiProvider(apiKey).
  endpoint?: string; // OpenAI 호환 base URL(설정 → llmEndpoint()). 없으면 Gemini 기본값.
}

export async function runWikiGeneration(
  input: LlmWikiInput,
  apiKey?: string,
  opts?: WikiGenOptions,
): Promise<WikiGenResult> {
  const key = apiKey?.trim();
  // endpoint 는 있을 때만 얹는다 — undefined 를 그대로 넘기면 provider 기본값을 덮어써 빈 주소가 된다.
  const ep = opts?.endpoint ? { endpoint: opts.endpoint } : {};
  const provider = opts?.provider ?? (key ? new GeminiProvider({ config: { apiKey: key, ...ep } }) : null);

  if (!provider) {
    // 키 없음 → 휴리스틱(기능은 동작시킨다)
    return withPromotion({ result: heuristicWiki(input), engine: "heuristic" });
  }

  try {
    if (opts?.chunk?.enabled) {
      const { result, chunkCount, nodeTypes } = await chunkedExtract(input, provider, opts.chunk, key, opts.endpoint);
      return withPromotion({ result, engine: "gemini", chunks: chunkCount, nodeTypes });
    }
    const result = await provider.generateWikiStructured(input);
    return withPromotion({ result, engine: "gemini" });
  } catch (e) {
    // 네트워크/CORS/키 문제 → 휴리스틱으로 폴백
    return withPromotion({ result: heuristicWiki(input), engine: "heuristic", warning: errMsg(e) });
  }
}

// ── [C] 청킹 추출: 원문을 의미 조각으로 나눠 조각별 추출 후 병합 ──────────────
// 조각 1개 이하면 통짜 단일 호출(청킹 이득 없음, 비용 절약). 조각들은 순차 처리하고
// 앞 조각의 개념을 다음 호출의 existingConcepts로 넘겨 교차-조각 관계가 해소되게 한다.
async function chunkedExtract(
  input: LlmWikiInput,
  provider: LlmProvider,
  chunkOpts: NonNullable<WikiGenOptions["chunk"]>,
  key?: string,
  endpoint?: string,
): Promise<{ result: LlmWikiResult; chunkCount: number; nodeTypes: Partial<Record<NodeType, number>> }> {
  const embed =
    chunkOpts.embed ??
    createGeminiEmbedder({ config: { apiKey: key ?? "", ...(endpoint ? { endpoint } : {}) } });
  const { chunks } = await semanticChunk(input.sourceText, {
    embed,
    percentile: chunkOpts.percentile,
    minSentences: chunkOpts.minSentences,
    classify, // [C]→[B]: 각 조각에 정보 유형 부여
  });
  const nodeTypes = typeDistribution(chunks);

  if (chunks.length <= 1) {
    return { result: await provider.generateWikiStructured(input), chunkCount: chunks.length, nodeTypes };
  }

  const cap = chunkOpts.maxChunks ?? 12;
  const used = chunks.slice(0, cap);
  if (chunks.length > cap) console.warn(`[chunk] ${chunks.length}개 중 상한 ${cap}개만 처리`);

  let concepts: LlmConcept[] = [];
  const relations: LlmRelation[] = [];
  for (const ch of used) {
    const existing = [
      ...input.existingConcepts,
      ...concepts.map((c) => ({ id: normalizeTitle(c.title), title: c.title, normalizedTitle: normalizeTitle(c.title) })),
    ];
    const r = await provider.generateWikiStructured({ ...input, sourceText: ch.text, existingConcepts: existing });
    // 이번 추출 내 동일 개념은 드롭이 아니라 결합 — 뒤 조각의 내용이 유실되지 않는다(#13).
    // (workspace 기존과의 병합은 applyLlmResult 몫.)
    concepts = mergeDuplicateConcepts([...concepts, ...r.concepts]);
    relations.push(...r.relations);
  }

  return { result: { concepts, relations: dedupeRelations(relations) }, chunkCount: used.length, nodeTypes };
}

// [B] 조각별 nodeType 분포 집계(advisory).
function typeDistribution(chunks: Chunk[]): Partial<Record<NodeType, number>> {
  const dist: Partial<Record<NodeType, number>> = {};
  for (const c of chunks) if (c.nodeType) dist[c.nodeType] = (dist[c.nodeType] ?? 0) + 1;
  return dist;
}

// 동일 (source|target|type) 관계 중복 제거(조각 간 중복 산출 방지).
function dedupeRelations(relations: LlmRelation[]): LlmRelation[] {
  const seen = new Set<string>();
  return relations.filter((r) => {
    const k = `${normalizeTitle(r.sourceConceptTitle)}|${normalizeTitle(r.targetConceptTitle)}|${r.relationType}`;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

// ── [E] 연결성 게이트 리포트 부착(비파괴) ──────────────────────
function withPromotion(base: WikiGenResult): WikiGenResult {
  return { ...base, promotion: promotionReport(base.result) };
}

function promotionReport(result: LlmWikiResult): PromotionReport {
  const titleById = new Map<string, string>();
  const nodes: { id: string }[] = [];
  for (const c of result.concepts) {
    const id = normalizeTitle(c.title);
    if (titleById.has(id)) continue; // 노드 id 중복 제거
    titleById.set(id, c.title);
    nodes.push({ id });
  }
  const edges = result.relations.map((r) => ({
    source: normalizeTitle(r.sourceConceptTitle),
    target: normalizeTitle(r.targetConceptTitle),
  }));
  const r = promote(nodes, edges, { round: 0 });
  const isolatedTitles = r.nodes.filter((n) => n.state === "staging").map((n) => titleById.get(n.id) ?? n.id);
  return { active: r.stats.active, staging: r.stats.staging, isolatedTitles };
}

// ── 휴리스틱 생성: 노트 → 개념 위키 + 관계 ──────────────────
// 규칙: `## 헤딩` 들을 하위 개념으로, 노트 제목을 상위 개념으로. 헤딩이 없으면 제목 1개만.
export function heuristicWiki(input: LlmWikiInput, lang: OutputLanguage = getOutputLanguage()): LlmWikiResult {
  const sections = splitSections(input.sourceText);
  const concepts: LlmConcept[] = [];
  const relations: LlmRelation[] = [];

  const rootTitle = cleanTitle(input.sourceTitle);
  const rootBody = sections.length ? input.sourceText : input.sourceText;
  concepts.push(concept(rootTitle, rootBody, lang));

  for (const sec of sections) {
    if (normalizeTitle(sec.title) === normalizeTitle(rootTitle)) continue;
    concepts.push(concept(sec.title, sec.body, lang));
    relations.push({
      sourceConceptTitle: sec.title,
      targetConceptTitle: rootTitle,
      relationType: "part_of",
      strength: 0.7,
      confidence: 0.6,
      explanation:
        lang === "en"
          ? `"${sec.title}" is a subtopic of the note "${rootTitle}". (heuristic)`
          : `"${sec.title}"는 "${rootTitle}" 노트의 하위 주제다. (휴리스틱)`,
      evidence: [],
    });
  }

  return { concepts, relations };
}

interface Section {
  title: string;
  body: string;
}

function splitSections(md: string): Section[] {
  const lines = md.replace(/\r\n/g, "\n").split("\n");
  const out: Section[] = [];
  let cur: Section | null = null;
  for (const line of lines) {
    const h = /^(#{1,3})\s+(.*)$/.exec(line.trim());
    if (h) {
      if (cur) out.push(cur);
      cur = { title: cleanTitle(h[2]), body: "" };
    } else if (cur) {
      cur.body += line + "\n";
    }
  }
  if (cur) out.push(cur);
  return out.filter((s) => s.title);
}

function concept(title: string, body: string, lang: OutputLanguage): LlmConcept {
  const text = body.trim();
  const summary = firstSentence(text) || (lang === "en" ? `${title} concept overview` : `${title} 개념 정리`);
  return {
    title,
    summary,
    explanation: text || summary,
    examples: [],
    sourceRefs: [],
    sourceEmbeds: [],
  };
}

function firstSentence(text: string): string {
  // 위키링크는 요약문에 들어갈 산문이 아니다. 게다가 아래 마크다운 평탄화가 '-' 를 공백으로
  // 바꿔 ![[a-b.pdf]] → ![[a b.pdf]] 로 파일명을 깨뜨린다(존재하지 않는 원본 = 깨진 임베드).
  // → 임베드는 통째로 버리고, 링크는 표시 텍스트만 남긴 뒤 평탄화한다.
  const prose = text
    .replace(/!\[\[[^\]]*\]\]/g, " ")
    .replace(/\[\[([^\]|]*)(?:\|([^\]]*))?\]\]/g, (_, target, alias) => alias ?? target);
  const flat = prose.replace(/[#*`>\-]/g, " ").replace(/\s+/g, " ").trim();
  const m = /^(.{0,140}?[.!?。])(\s|$)/.exec(flat);
  return (m ? m[1] : flat.slice(0, 140)).trim();
}

function cleanTitle(s: string): string {
  return s.replace(/^#+\s*/, "").replace(/[*`]/g, "").trim();
}

