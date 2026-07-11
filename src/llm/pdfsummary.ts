// PDF 추출 영어 텍스트 → 한국어 번역·요약 스트리밍 (Inbox PDF 임포트). SSOT: docs/30-llm/prompt-templates.md §11.
//  - Gemini(OpenAI 호환 Chat Completions)를 stream:true 로 호출해 delta 를 실시간 전달(streamChatText).
//  - 번역이므로 오프라인 휴리스틱 폴백은 없다 — 키 없거나 스트림 시작 전 실패면 throw(호출부가 안내).
//  - 재시도는 첫 delta 이전 실패만. 도중 실패는 부분 텍스트를 유지한 채 PdfSummaryStreamError.

import { streamChatText } from "./stream";
import { GEMINI_MODEL } from "./gemini";

export interface PdfSummaryInput {
  sourceTitle: string;
  sourceText: string;
}

export interface PdfSummaryResult {
  markdown: string;
  truncated: boolean; // 입력이 상한을 넘어 잘렸는지 — 호출부가 사용자에게 알린다
  warning?: string; // 일부만 생성됨 등
}

export interface PdfSummaryOptions {
  onDelta?: (full: string) => void;
  signal?: AbortSignal;
  endpoint?: string;
  model?: string;
  fetchFn?: typeof fetch;
  maxRetries?: number; // 기본 2
  backoffMs?: number; // 기본 250 (0=즉시, 테스트용)
}

/** 스트림 도중(첫 delta 이후) 실패 — 부분 텍스트는 화면에 유지, 재시도·교체 없음. */
export class PdfSummaryStreamError extends Error {}

// 입력 상한 — 초과분은 잘라 보내고 잘림 사실을 모델에게 알린다.
export const SUMMARY_MAX_CHARS = 48_000;
const MAX_OUTPUT_TOKENS = 8192;

const SYSTEM_PROMPT =
  "너는 영어 학습 자료를 한국어 요약 노트로 만들어 주는 번역·요약 편집자다.\n" +
  "PDF에서 추출한 영어 원문을 읽고, 한국어로 번역·요약된 학습 노트를 마크다운으로 작성한다.\n" +
  "[규칙 — 엄격]\n" +
  "1. 원문에 실제로 있는 내용만 쓴다. 원문에 없는 사실·수치·예시·결론을 지어내지 않는다. 일반 지식·표준 커리큘럼으로 보충하지 않는다. 애매하면 뺀다.\n" +
  "2. 출력 구조:\n" +
  "   - 맨 위에 `# 요약` 헤딩과 문서 전체의 핵심 2~4문장.\n" +
  "   - 이어서 원문의 주요 섹션 순서대로 `## {번호}. {한국어로 번역한 섹션 제목}` 헤딩과 그 섹션의 핵심 내용을 한국어로 요약한 본문.\n" +
  "3. 본문은 짧은 문단과 불릿으로 압축한다 — 전문 번역이 아니라 요약이다. 섹션당 3~8줄.\n" +
  "4. 수식은 KaTeX 문법으로 쓴다 — 인라인은 $...$, 블록 수식은 $$...$$. 블록 수식은 콜아웃 밖에만 둔다.\n" +
  "5. 어렵거나 핵심적인 개념이 있는 섹션에는 쉬운 설명 콜아웃을 넣는다:\n" +
  "   > [!easy] 쉬운 설명\n" +
  "   > (일상적인 비유로 풀어낸 설명 — 2~4문장)\n" +
  "   콜아웃의 모든 줄은 `> ` 로 시작한다. 모든 섹션에 강제로 넣지 말고 필요한 곳에만.\n" +
  "6. 전문 용어는 처음 한 번만 「한국어 번역(영어 원어)」로 병기하고, 이후는 한국어만 쓴다.\n" +
  "7. 페이지 번호·출처 표기·==하이라이트== 는 쓰지 않는다.\n" +
  "8. 출력은 순수 마크다운만 — 인사말·머리말·설명 문장·코드펜스(```)로 감싸기 금지.";

export function buildPdfSummaryBody(input: PdfSummaryInput, model = GEMINI_MODEL) {
  const clipped =
    input.sourceText.length > SUMMARY_MAX_CHARS
      ? `${input.sourceText.slice(0, SUMMARY_MAX_CHARS)}\n\n(입력 상한 초과 — 이후 내용 잘림)`
      : input.sourceText;
  return {
    model,
    messages: [
      { role: "system", content: SYSTEM_PROMPT },
      {
        role: "user",
        content:
          `[문서]\n제목: ${input.sourceTitle}\n영어 원문(PDF 추출, 페이지 구분 없음):\n${clipped}\n\n` +
          "위 문서를 규칙에 따라 `# 요약`으로 시작하는 한국어 요약 노트로 작성하라.",
      },
    ],
    temperature: 0.2,
    max_tokens: MAX_OUTPUT_TOKENS,
  };
}

export async function runPdfSummary(
  input: PdfSummaryInput,
  apiKey?: string,
  opts?: PdfSummaryOptions,
): Promise<PdfSummaryResult> {
  const key = apiKey?.trim();
  if (!key) throw new Error("[pdfsummary] auth: GEMINI 키 없음");

  const truncated = input.sourceText.length > SUMMARY_MAX_CHARS;
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
        body: buildPdfSummaryBody(input, opts?.model),
        endpoint: opts?.endpoint,
        signal: opts?.signal,
        onDelta,
        fetchFn: opts?.fetchFn,
      });
      if (!r.text.trim()) throw new Error("[pdfsummary] 빈 응답");
      return { markdown: r.text, truncated, warning: r.incomplete ? `일부만 생성됨 (${r.incomplete})` : undefined };
    } catch (e) {
      if (isAbort(e)) throw e; // 사용자 취소 — 재시도 없음
      if (gotDelta) throw new PdfSummaryStreamError(errMsg(e)); // 도중 실패 — 부분 유지
      lastError = errMsg(e);
      if (lastError.includes("auth")) break; // 401/403 터미널
    }
  }
  throw new Error(lastError || "[pdfsummary] 실패");
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
