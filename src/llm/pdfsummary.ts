// PDF 추출 영어 텍스트 → 한국어 번역·요약 스트리밍 (Inbox PDF 임포트). SSOT: docs/30-llm/prompt-templates.md §11.
//  - Gemini(OpenAI 호환 Chat Completions)를 stream:true 로 호출해 delta 를 실시간 전달(streamChatText).
//  - 번역이므로 오프라인 휴리스틱 폴백은 없다 — 키 없거나 스트림 시작 전 실패면 throw(호출부가 안내).
//  - 재시도는 첫 delta 이전 실패만. 도중 실패는 부분 텍스트를 유지한 채 PdfSummaryStreamError.

import { streamChatText } from "./stream";
import { getGeminiModel } from "./gemini";
import { getOutputLanguage, type OutputLanguage } from "./language";

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
  lang?: OutputLanguage; // 미지정 시 설정값(getOutputLanguage)
}

/** 스트림 도중(첫 delta 이후) 실패 — 부분 텍스트는 화면에 유지, 재시도·교체 없음. */
export class PdfSummaryStreamError extends Error {}

// 입력 상한 — 초과분은 잘라 보내고 잘림 사실을 모델에게 알린다.
export const SUMMARY_MAX_CHARS = 48_000;
const MAX_OUTPUT_TOKENS = 8192;

const SYSTEM_PROMPT_KO =
  "너는 영어 학습 자료를 한국어 요약 노트로 만들어 주는 번역·요약 편집자다.\n" +
  "PDF에서 추출한 영어 원문을 읽고, 한국어로 번역·요약된 학습 노트를 마크다운으로 작성한다.\n" +
  "[규칙 — 엄격]\n" +
  "1. 원문에 실제로 있는 내용만 쓴다. 원문에 없는 사실·수치·예시·결론을 지어내지 않는다. 일반 지식·표준 커리큘럼으로 보충하지 않는다. 애매하면 뺀다.\n" +
  "2. 출력 구조:\n" +
  "   - 맨 위에 `# 요약` 헤딩과 문서 전체의 핵심 2~4문장.\n" +
  "   - 이어서 원문의 주요 섹션 순서대로 `## {번호}. {한국어로 번역한 섹션 제목}` 헤딩과 그 섹션의 핵심 내용을 한국어로 요약한 본문.\n" +
  "3. 본문은 짧은 문단과 불릿으로 압축한다 — 전문 번역이 아니라 요약이다. 섹션당 3~8줄.\n" +
  "4. 수식은 KaTeX 문법으로 쓴다 — 인라인은 $...$, 블록 수식은 $$...$$. 블록 수식은 콜아웃 밖에만 둔다.\n" +
  "5. **모든 `##` 섹션마다 예외 없이** 그 섹션 마지막에 쉬운 설명 콜아웃을 하나 넣는다. **줄글 한 덩어리로 쓰지 말고 구조화**해서 스캔되게 한다. 콜아웃의 모든 줄은 `> ` 로 시작한다:\n" +
  "   > [!easy] 쉬운 설명\n" +
  "   > **한마디로:** (이 섹션 핵심을 일상 비유와 함께 1~2문장)\n" +
  "   >\n" +
  "   > #### (소주제 제목)\n" +
  "   > - **(라벨):** (짧은 설명)\n" +
  "   > - **(라벨):** (짧은 설명)\n" +
  "   내용이 여러 갈래면 `#### 소주제` 로 묶고 그 아래 `- **라벨:** 설명` 불릿으로 편다. 하위 항목은 한 단계 들여쓴 불릿(`>   - `)으로. 단순하면 한마디로 + 불릿 2~3개로 짧게 — 과하게 길게 쓰지 않는다.\n" +
  "   중학생도 알아들을 말로, 전문 용어 재나열 금지, **이모지·이모티콘 금지**. 원문에 있는 내용만 다룬다(비유는 새로 들어도 되지만, 사실은 지어내지 않는다).\n" +
  "6. 전문 용어는 처음 한 번만 「한국어 번역(영어 원어)」로 병기하고, 이후는 한국어만 쓴다.\n" +
  "7. 페이지 번호·출처 표기·==하이라이트== 는 쓰지 않는다.\n" +
  "8. 출력은 순수 마크다운만 — 인사말·머리말·설명 문장·코드펜스(```)로 감싸기 금지.";

const SYSTEM_PROMPT_EN =
  "You are an editor who turns study material extracted from a PDF into a concise English summary note in Markdown.\n" +
  "[Rules — strict]\n" +
  "1. Only include what is actually in the source. Never invent facts, numbers, examples, or conclusions. Do not supplement with general knowledge or standard curriculum. When unsure, leave it out.\n" +
  "2. Output structure:\n" +
  "   - Start with a `# Summary` heading and 2-4 sentences covering the whole document.\n" +
  "   - Then, following the source's main sections in order, `## {number}. {section title}` headings with each section's key content summarized.\n" +
  "3. Compress into short paragraphs and bullets — this is a summary, not a full translation. 3-8 lines per section.\n" +
  "4. Write math in KaTeX syntax — inline $...$, block $$...$$. Block math goes outside callouts only.\n" +
  "5. **Every `##` section, no exceptions**, ends with one plain-language callout. **Do not write a single prose blob — structure it** so it scans. Every callout line starts with `> `:\n" +
  "   > [!easy] In plain terms\n" +
  "   > **In a nutshell:** (the section's core in 1-2 sentences with an everyday analogy)\n" +
  "   >\n" +
  "   > #### (subtopic title)\n" +
  "   > - **(label):** (short explanation)\n" +
  "   > - **(label):** (short explanation)\n" +
  "   When the content splits into strands, group them under `#### subtopic` with `- **label:** explanation` bullets. Sub-items as one-level-indented bullets (`>   - `). If it is simple, keep it to the nutshell + 2-3 bullets — do not over-write.\n" +
  "   Middle-schooler language, no jargon dumps, **no emoji**. Source content only (new analogies fine; new facts not).\n" +
  "6. No page numbers, no source citations, no ==highlights==.\n" +
  "7. Output pure Markdown only — no greetings, no preamble, no code-fence wrapping.";

const systemPrompt = (lang: OutputLanguage) => (lang === "en" ? SYSTEM_PROMPT_EN : SYSTEM_PROMPT_KO);

export function buildPdfSummaryBody(
  input: PdfSummaryInput,
  model: string = getGeminiModel(),
  lang: OutputLanguage = getOutputLanguage(),
) {
  const clipped =
    input.sourceText.length > SUMMARY_MAX_CHARS
      ? `${input.sourceText.slice(0, SUMMARY_MAX_CHARS)}\n\n(입력 상한 초과 — 이후 내용 잘림)`
      : input.sourceText;
  const userMsg =
    lang === "en"
      ? `[Document]\nTitle: ${input.sourceTitle}\nSource text (PDF extract, no page breaks):\n${clipped}\n\n` +
        "Following the rules, write an English summary note starting with `# Summary`."
      : `[문서]\n제목: ${input.sourceTitle}\n영어 원문(PDF 추출, 페이지 구분 없음):\n${clipped}\n\n` +
        "위 문서를 규칙에 따라 `# 요약`으로 시작하는 한국어 요약 노트로 작성하라.";
  return {
    model,
    messages: [
      { role: "system", content: systemPrompt(lang) },
      { role: "user", content: userMsg },
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
        body: buildPdfSummaryBody(input, opts?.model, opts?.lang),
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
