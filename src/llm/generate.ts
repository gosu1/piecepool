import type { LlmWikiInput, LlmWikiResult, LlmConcept, LlmRelation } from "./provider";
import { OpenAiProvider } from "./openai";

// LLM 위키 생성 오케스트레이션 (README §LLM ①).
//  - apiKey 있으면 OpenAI(Responses API, 구조화 출력) 호출.
//  - 없거나 실패하면 노트를 헤딩 단위 개념으로 쪼개는 휴리스틱으로 폴백 → 키 없이도 동작.

export interface WikiGenResult {
  result: LlmWikiResult;
  engine: "openai" | "heuristic";
  warning?: string;
}

export async function runWikiGeneration(input: LlmWikiInput, apiKey?: string): Promise<WikiGenResult> {
  if (apiKey && apiKey.trim()) {
    try {
      const provider = new OpenAiProvider({ config: { apiKey: apiKey.trim() } });
      const result = await provider.generateWikiStructured(input);
      return { result, engine: "openai" };
    } catch (e) {
      // 네트워크/CORS/키 문제 → 휴리스틱으로 폴백(기능은 동작시킨다)
      return { result: heuristicWiki(input), engine: "heuristic", warning: errMsg(e) };
    }
  }
  return { result: heuristicWiki(input), engine: "heuristic" };
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
