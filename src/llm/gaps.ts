import { LinerClient, type LinerSource } from "./liner";
import { extractChatJson, GEMINI_OPENAI_ENDPOINT, GEMINI_MODEL } from "./gemini";

// 정보 간극 메우기 (README §LLM ③, feature 3). 정답(label)과 사용자 필기 사이 간극을
// 소크라테스/하브루타식으로 되묻는다 — 정답을 주입하지 않고 1~3개 선택지 + "기타"로 가이드.
// 엔진 우선순위(SSOT: CLAUDE.md LLM Provider Rules · provider-config.md §3.3):
//   ① Liner — 권위 출처 검색으로 정답 기준(label)을 세워 선택지·출처 구성 (주)
//   ② Gemini — Liner 미가용 시 소크라테스식 되묻기 생성 (보조)
//   ③ 휴리스틱 — 키 전부 없음/전부 실패 (오프라인 최후)

export interface GapSource {
  title: string;
  url: string;
}

export interface GapQuestion {
  context: string; // 점검 대상 개념/구절
  prompt: string; // "이렇게 생각하신 게 맞나요?"
  choices: string[]; // 1~3개 가이드 선택지
  allowOther: boolean; // "기타" 직접 설명 칸
  sources?: GapSource[]; // Liner 검증 출처(있을 때만)
}

export type GapEngine = "liner" | "gemini" | "heuristic";

export interface GapReport {
  questions: GapQuestion[];
  engine: GapEngine;
}

export interface BuildGapDeps {
  linerClient?: LinerClient; // 주입(테스트/대체)
  fetchFn?: typeof fetch; // Gemini 보조 호출용 주입
  geminiEndpoint?: string;
}

export async function buildGaps(
  title: string,
  text: string,
  keys: { liner?: string; gemini?: string },
  deps?: BuildGapDeps,
): Promise<GapReport> {
  // ① Liner
  const linerKey = keys.liner?.trim();
  if (linerKey || deps?.linerClient) {
    try {
      const client = deps?.linerClient ?? new LinerClient({ config: { apiKey: linerKey ?? "" } });
      const questions = await linerGaps(title, text, client);
      if (questions.length > 0) return { questions, engine: "liner" };
    } catch {
      // ↓ Gemini 보조로
    }
  }
  // ② Gemini 소크라테스식
  const geminiKey = keys.gemini?.trim();
  if (geminiKey) {
    try {
      const questions = await geminiGaps(title, text, geminiKey, deps);
      if (questions.length > 0) return { questions, engine: "gemini" };
    } catch {
      // ↓ 휴리스틱으로
    }
  }
  // ③ 오프라인 휴리스틱
  return { questions: heuristicGaps(title, text), engine: "heuristic" };
}

// ── ① Liner: 섹션별 출처 검색 → label 스니펫을 선택지로 ──────────────
async function linerGaps(title: string, text: string, client: LinerClient): Promise<GapQuestion[]> {
  const targets = topSections(title, text);
  const out: GapQuestion[] = [];
  let failures = 0;
  for (const s of targets) {
    const claim = firstSentence(s.body) || `${s.title}의 핵심`;
    try {
      const { answer, sources } = await client.search(`${title} ${s.title} 핵심 개념 정의`.slice(0, 200));
      // label(권위 출처) 기준 선택지 — 스니펫이 없으면 answer 요약으로.
      const label = truncate(sources[0]?.snippet ?? answer ?? "", 120);
      out.push({
        context: s.title,
        prompt: `"${s.title}"에 대해 이렇게 이해하신 게 맞나요?`,
        choices: [claim, label ? `출처 기준: ${label}` : "", "헷갈려서 다시 정리하고 싶다"].filter(Boolean).slice(0, 3),
        allowOther: true,
        sources: sources.slice(0, 3).map((x: LinerSource) => ({ title: x.title, url: x.url })),
      });
    } catch {
      failures++;
    }
  }
  // 전부 실패했으면 Liner 미가용으로 판단 → 상위에서 Gemini 폴백.
  if (out.length === 0 && failures > 0) throw new Error("[provider=liner] all section queries failed");
  return out;
}

// ── ② Gemini: 소크라테스식 되묻기 생성 (OpenAI 호환 Chat Completions, json_schema) ──────
const GAP_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["questions"],
  properties: {
    questions: {
      type: "array",
      maxItems: 3,
      items: {
        type: "object",
        additionalProperties: false,
        required: ["context", "prompt", "choices"],
        properties: {
          context: { type: "string" },
          prompt: { type: "string" },
          choices: { type: "array", maxItems: 3, items: { type: "string" } },
        },
      },
    },
  },
} as const;

async function geminiGaps(title: string, text: string, apiKey: string, deps?: BuildGapDeps): Promise<GapQuestion[]> {
  const fetchFn = deps?.fetchFn ?? globalThis.fetch.bind(globalThis);
  const endpoint = deps?.geminiEndpoint ?? GEMINI_OPENAI_ENDPOINT;
  const system =
    "You are a Socratic study coach. Given a student's note, produce up to 3 gap-check questions in Korean. " +
    "Never inject the answer; each question offers 1-3 guiding choices (student's likely claim first). " +
    "Respond ONLY with JSON conforming to the schema.";
  const res = await fetchFn(`${endpoint}/chat/completions`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({
      model: GEMINI_MODEL,
      messages: [
        { role: "system", content: system },
        { role: "user", content: JSON.stringify({ title, note: text.slice(0, 6000) }) },
      ],
      // Chat Completions 구조화 출력 — strict:false + 다운스트림 파싱(gemini.ts 와 동일 규약).
      response_format: { type: "json_schema", json_schema: { name: "GapQuestions", strict: false, schema: GAP_SCHEMA } },
    }),
  });
  if (!res.ok) throw new Error(`[provider=gemini] gaps: HTTP ${res.status}`);
  // Chat Completions 응답 → choices[0].message.content JSON — gemini.ts extractChatJson 재사용.
  const parsed = extractChatJson(await res.json()) as {
    questions?: Array<{ context?: string; prompt?: string; choices?: string[] }>;
  } | null;
  if (!parsed?.questions) throw new Error("[provider=gemini] gaps: no structured output");
  return parsed.questions
    .filter((q) => q.prompt)
    .map((q) => ({
      context: q.context ?? title,
      prompt: q.prompt!,
      choices: (q.choices ?? []).slice(0, 3),
      allowOther: true,
    }));
}

// ── ③ 휴리스틱 (오프라인 최후 — clarify 폴백·테스트에서도 사용) ──────────
export function heuristicGaps(title: string, text: string): GapQuestion[] {
  return topSections(title, text).map((s) => {
    const claim = firstSentence(s.body) || `${s.title}의 핵심`;
    return {
      context: s.title,
      prompt: `"${s.title}"에 대해 이렇게 이해하신 게 맞나요?`,
      choices: [claim, "부분적으로만 맞는 것 같다", "헷갈려서 다시 정리하고 싶다"].filter(Boolean).slice(0, 3),
      allowOther: true,
    };
  });
}

// ── 공용 파서 ──────────────────────────────────────────────
interface Section {
  title: string;
  body: string;
}

function topSections(title: string, text: string): Section[] {
  const secs = splitSections(text);
  return secs.length ? secs.slice(0, 3) : [{ title, body: text }];
}

function splitSections(md: string): Section[] {
  const lines = md.replace(/\r\n/g, "\n").split("\n");
  const out: Section[] = [];
  let cur: Section | null = null;
  for (const line of lines) {
    const h = /^(#{1,3})\s+(.*)$/.exec(line.trim());
    if (h) {
      if (cur) out.push(cur);
      cur = { title: h[2].replace(/[*`]/g, "").trim(), body: "" };
    } else if (cur) cur.body += line + "\n";
  }
  if (cur) out.push(cur);
  return out.filter((s) => s.title);
}

function firstSentence(text: string): string {
  const flat = text.replace(/[#*`>\-]/g, " ").replace(/\s+/g, " ").trim();
  const m = /^(.{0,120}?[.!?。])(\s|$)/.exec(flat);
  return (m ? m[1] : flat.slice(0, 120)).trim();
}

function truncate(s: string, n: number): string {
  const flat = s.replace(/\s+/g, " ").trim();
  return flat.length > n ? flat.slice(0, n - 1) + "…" : flat;
}
