// 파편 노트 → 정리 글 합성 (README §정리 글). SSOT: docs/30-llm/note-synthesis.md, 프롬프트: prompt-templates.md §10.
//  - apiKey 있으면 Gemini(OpenAI 호환 Chat Completions) 를 stream:true 로 호출해 delta 를 실시간 전달.
//  - 없으면 결정적 휴리스틱 재배열 → 키 없이도 동작(가짜 스트리밍 없음, 즉시 전체 전달).
//  - 재시도는 첫 delta 이전 실패만 — 도중 실패는 부분 텍스트를 유지한 채 SynthesisStreamError.

import { streamChatText } from "./stream";
import { getGeminiModel } from "./gemini";
import { languageDirective, getOutputLanguage, type OutputLanguage } from "./language";

export interface SynthesisInput {
  sourceTitle: string;
  sourceText: string;
}

export interface SynthesisResult {
  markdown: string;
  engine: "gemini" | "heuristic";
  warning?: string; // 폴백 사유 / 일부만 생성됨
}

export interface SynthesisOptions {
  onDelta?: (full: string) => void;
  signal?: AbortSignal;
  endpoint?: string;
  model?: string;
  fetchFn?: typeof fetch;
  maxRetries?: number; // 기본 2 (openai.ts 미러)
  backoffMs?: number; // 기본 250 (0=즉시, 테스트용)
  lang?: OutputLanguage; // 미지정 시 설정값(getOutputLanguage)
}

/** 스트림 도중(첫 delta 이후) 실패 — 부분 텍스트는 화면에 유지, 저장 금지, 휴리스틱 교체 금지. */
export class SynthesisStreamError extends Error {}

const systemPrompt = (lang: OutputLanguage) =>
  "너는 학습 노트 편집자다. 학생이 수업 중 급하게 적은 파편 메모(불릿, 반문장, 화살표, 순서 뒤섞임)를 " +
  "하나의 논리적으로 정리된 마크다운 글로 재구성한다.\n" +
  "[규칙 — 엄격]\n" +
  "1. 파편에 있는 모든 사실을 보존한다. 어떤 정보도 빼먹지 않는다.\n" +
  "2. 파편에 없는 내용을 지어내지 않는다. 일반 지식으로 보충하지 않는다.\n" +
  "3. 논리적 순서로 재배열하고 ## 헤딩으로 주제를 묶는다.\n" +
  "4. [[위키링크]]와 ![[임베드]]는 글자 그대로 유지한다 (수정·삭제 금지).\n" +
  "5. 출력은 순수 마크다운만. 설명 문장·코드펜스 감싸기 금지.\n" +
  "6. 첫 줄은 반드시 '# {제목}' 한 줄이다.\n" +
  "7. 출력 언어·용어 규칙:\n" +
  languageDirective(lang);

// 첫 토큰 지연 최소화(reasoning 모델) + 출력 상한 — 튜너블 상수.
const MAX_OUTPUT_TOKENS = 8192;

export function buildSynthesisBody(
  input: SynthesisInput,
  model: string = getGeminiModel(),
  lang: OutputLanguage = getOutputLanguage(),
) {
  const ask =
    lang === "en"
      ? `Rewrite the fragments above into one organized article starting with '# ${input.sourceTitle}'.`
      : `위 파편을 '# ${input.sourceTitle} 정리'로 시작하는 하나의 정리 글로 재구성하라.`;
  return {
    model,
    messages: [
      { role: "system", content: systemPrompt(lang) },
      {
        role: "user",
        content: `[노트]\n제목: ${input.sourceTitle}\n파편 원문:\n${input.sourceText}\n\n` + ask,
      },
    ],
    max_tokens: MAX_OUTPUT_TOKENS,
  };
}

export async function runSynthesis(
  input: SynthesisInput,
  apiKey?: string,
  opts?: SynthesisOptions,
): Promise<SynthesisResult> {
  const key = apiKey?.trim();
  if (!key) {
    const h = heuristicSynthesis(input);
    opts?.onDelta?.(h.markdown);
    return h;
  }

  const maxRetries = opts?.maxRetries ?? 2;
  const backoffMs = opts?.backoffMs ?? 250;
  let gotDelta = false;
  const onDelta = (full: string) => {
    gotDelta = true;
    opts?.onDelta?.(full);
  };

  let lastError = "";
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    if (attempt > 0) await sleep(backoffMs * 2 ** (attempt - 1));
    try {
      const r = await streamChatText({
        apiKey: key,
        body: buildSynthesisBody(input, opts?.model, opts?.lang),
        endpoint: opts?.endpoint,
        signal: opts?.signal,
        onDelta,
        fetchFn: opts?.fetchFn,
      });
      if (!r.text.trim()) throw new Error("[synthesize] 빈 응답");
      return {
        markdown: r.text,
        engine: "gemini",
        warning: r.incomplete ? `일부만 생성됨 (${r.incomplete})` : undefined,
      };
    } catch (e) {
      if (isAbort(e)) throw e; // 사용자 취소 — 폴백/재시도 없음
      if (gotDelta) throw new SynthesisStreamError(errMsg(e)); // 도중 실패 — 부분 유지
      lastError = errMsg(e);
      if (lastError.includes("auth")) break; // 401/403 터미널 (gemini.ts 와 동일 정책)
    }
  }
  // 스트림 시작 전 실패(재시도 소진) → 휴리스틱 폴백 (generate.ts 패턴)
  const h = heuristicSynthesis(input);
  opts?.onDelta?.(h.markdown);
  return { ...h, warning: lastError };
}

// ── 휴리스틱 합성: 결정적 재배열만 — 문장 생성·사실 창작 없음 ──────────────
// 규칙: `# 제목 정리` 헤더 + 안내 인용, 기존 헤딩 유지(h1→h2 강등), 코드펜스/불릿/인용/임베드 원형 보존,
// 빈 줄로 나뉜 연속 산문은 한 문단으로 병합, `->` → `→` 정규화. 헤딩이 하나도 없으면 전부 "## 메모" 아래.
export function heuristicSynthesis(input: SynthesisInput): SynthesisResult {
  const lines = input.sourceText.replace(/\r\n/g, "\n").split("\n");
  const out: string[] = [`# ${input.sourceTitle} 정리`, "", "> 오프라인 정리 — 원문 구조 기반 재배열 (문장 생성 없음)"];
  let para: string[] = [];
  let inFence = false;
  let sawHeading = false;
  const flush = () => {
    if (para.length) {
      out.push("", para.join(" "));
      para = [];
    }
  };
  for (const raw of lines) {
    const t = raw.trim();
    if (t.startsWith("```")) {
      flush();
      inFence = !inFence;
      out.push(raw);
      continue;
    }
    if (inFence) {
      out.push(raw);
      continue;
    }
    if (!t) {
      flush();
      continue;
    }
    if (/^#{1,6}\s/.test(t)) {
      flush();
      sawHeading = true;
      out.push("", t.replace(/^#\s/, "## ")); // h1 은 h2 로 강등 — 문서 제목과 충돌 방지
      continue;
    }
    if (/^([-*+]\s|\d+\.\s|>)/.test(t) || t.startsWith("![[")) {
      flush();
      out.push(t.replace(/->/g, "→"));
      continue;
    }
    para.push(t.replace(/->/g, "→"));
  }
  flush();
  if (!sawHeading && out.length > 3) out.splice(3, 0, "", "## 메모");
  return { markdown: out.join("\n"), engine: "heuristic" };
}

function isAbort(e: unknown): boolean {
  return e instanceof Error && e.name === "AbortError";
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function errMsg(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}
