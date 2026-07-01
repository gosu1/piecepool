import type { LlmProvider, LlmWikiInput, LlmWikiResult, LlmConcept, LlmRelation } from "./provider";
import { OpenAiProvider } from "./openai";
import { semanticChunk, type EmbedFn, type Chunk } from "./chunk";
import { createOpenAiEmbedder } from "./embeddings";
import { promote } from "./promote";
import { classify, type NodeType } from "./classify";

// LLM 위키 생성 오케스트레이션 (README §LLM ①).
//  - apiKey 있으면 OpenAI(Responses API, 구조화 출력) 호출.
//  - 없거나 실패하면 노트를 헤딩 단위 개념으로 쪼개는 휴리스틱으로 폴백 → 키 없이도 동작.
//  - [C] semantic chunking(opt-in) + [E] promotion 연결성 게이트(항상, advisory) 연결. SSOT: docs/30-llm/README.md §C·§E.

export interface WikiGenResult {
  result: LlmWikiResult;
  engine: "openai" | "heuristic";
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
    embed?: EmbedFn; // 주입(테스트/대체). 기본 createOpenAiEmbedder(apiKey).
  };
  provider?: LlmProvider; // 주입(테스트/대체). 기본 new OpenAiProvider(apiKey).
}

export async function runWikiGeneration(
  input: LlmWikiInput,
  apiKey?: string,
  opts?: WikiGenOptions,
): Promise<WikiGenResult> {
  const key = apiKey?.trim();
  const provider = opts?.provider ?? (key ? new OpenAiProvider({ config: { apiKey: key } }) : null);

  if (!provider) {
    // 키 없음 → 휴리스틱(기능은 동작시킨다)
    return withPromotion({ result: heuristicWiki(input), engine: "heuristic" });
  }

  try {
    if (opts?.chunk?.enabled) {
      const { result, chunkCount, nodeTypes } = await chunkedExtract(input, provider, opts.chunk, key);
      return withPromotion({ result, engine: "openai", chunks: chunkCount, nodeTypes });
    }
    const result = await provider.generateWikiStructured(input);
    return withPromotion({ result, engine: "openai" });
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
): Promise<{ result: LlmWikiResult; chunkCount: number; nodeTypes: Partial<Record<NodeType, number>> }> {
  const embed = chunkOpts.embed ?? createOpenAiEmbedder({ config: { apiKey: key ?? "" } });
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

  const concepts: LlmConcept[] = [];
  const relations: LlmRelation[] = [];
  const seen = new Set<string>(); // 이번 추출 내 개념 중복 방지(workspace 기존은 applyLlmResult가 병합)
  for (const ch of used) {
    const existing = [
      ...input.existingConcepts,
      ...concepts.map((c) => ({ id: normalize(c.title), title: c.title, normalizedTitle: normalize(c.title) })),
    ];
    const r = await provider.generateWikiStructured({ ...input, sourceText: ch.text, existingConcepts: existing });
    for (const c of r.concepts) {
      const k = normalize(c.title);
      if (seen.has(k)) continue;
      seen.add(k);
      concepts.push(c);
    }
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
    const k = `${normalize(r.sourceConceptTitle)}|${normalize(r.targetConceptTitle)}|${r.relationType}`;
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
    const id = normalize(c.title);
    if (titleById.has(id)) continue; // 노드 id 중복 제거
    titleById.set(id, c.title);
    nodes.push({ id });
  }
  const edges = result.relations.map((r) => ({
    source: normalize(r.sourceConceptTitle),
    target: normalize(r.targetConceptTitle),
  }));
  const r = promote(nodes, edges, { round: 0 });
  const isolatedTitles = r.nodes.filter((n) => n.state === "staging").map((n) => titleById.get(n.id) ?? n.id);
  return { active: r.stats.active, staging: r.stats.staging, isolatedTitles };
}

// ── 휴리스틱 생성: 노트 → 개념 위키 + 관계 ──────────────────
// 규칙: `## 헤딩` 들을 하위 개념으로, 노트 제목을 상위 개념으로. 헤딩이 없으면 제목 1개만.
export function heuristicWiki(input: LlmWikiInput): LlmWikiResult {
  const sections = splitSections(input.sourceText);
  const concepts: LlmConcept[] = [];
  const relations: LlmRelation[] = [];

  const rootTitle = cleanTitle(input.sourceTitle);
  const rootBody = sections.length ? input.sourceText : input.sourceText;
  concepts.push(concept(rootTitle, rootBody));

  for (const sec of sections) {
    if (normalize(sec.title) === normalize(rootTitle)) continue;
    concepts.push(concept(sec.title, sec.body));
    relations.push({
      sourceConceptTitle: sec.title,
      targetConceptTitle: rootTitle,
      relationType: "part_of",
      strength: 0.7,
      confidence: 0.6,
      explanation: `"${sec.title}"는 "${rootTitle}" 노트의 하위 주제다. (휴리스틱)`,
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

function concept(title: string, body: string): LlmConcept {
  const text = body.trim();
  const summary = firstSentence(text) || `${title} 개념 정리`;
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
  const flat = text.replace(/[#*`>\-]/g, " ").replace(/\s+/g, " ").trim();
  const m = /^(.{0,140}?[.!?。])(\s|$)/.exec(flat);
  return (m ? m[1] : flat.slice(0, 140)).trim();
}

function cleanTitle(s: string): string {
  return s.replace(/^#+\s*/, "").replace(/[*`]/g, "").trim();
}

function normalize(s: string): string {
  return s.toLowerCase().replace(/\s+/g, " ").trim();
}

function errMsg(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}
