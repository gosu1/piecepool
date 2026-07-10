// PDF 추출 텍스트 → 요약·정리 마크다운 (Inbox PDF 임포트). Gemini(OpenAI 호환 Chat Completions).
// 정답 주입 금지 — 추출 텍스트에 있는 것만 정리한다. 키 없거나 실패면 원문 폴백(오프라인 전기능).

import { extractText } from "./ocr";
import { GEMINI_OPENAI_ENDPOINT, GEMINI_MODEL } from "./gemini";

export interface PdfDigestResult {
  markdown: string;
  engine: "gemini" | "none";
  truncated: boolean; // 입력이 48k 상한을 넘어 잘렸는지 — 호출부가 사용자에게 알린다
}

// 입력 상한 — 초과분은 잘라 보내고 잘림 사실을 모델에게 알린다.
export const DIGEST_MAX_CHARS = 48_000;

const DIGEST_INSTRUCTION =
  "아래는 PDF에서 추출한 텍스트다. 학습 노트용 마크다운으로 정리하라. 텍스트에 없는 내용을 지어내지 말 것.\n" +
  "## 정리\n(제목·목록으로 핵심 내용을 재구성 — 개념·정의·수식 포함)\n" +
  "## 요약\n(핵심 3줄 이내)";

export function buildPdfDigestRequest(text: string, model = GEMINI_MODEL) {
  const clipped = text.length > DIGEST_MAX_CHARS ? `${text.slice(0, DIGEST_MAX_CHARS)}\n\n(입력 상한 초과 — 이후 내용 잘림)` : text;
  return {
    model,
    messages: [
      { role: "system", content: "너는 학습 자료 정리 도우미다. PDF 추출 텍스트만 근거로 구조화·요약한다." },
      { role: "user", content: `${DIGEST_INSTRUCTION}\n\n---\n\n${clipped}` },
    ],
  };
}

export async function runPdfDigest(
  text: string,
  apiKey: string,
  opts?: { endpoint?: string; model?: string; fetchFn?: typeof fetch },
): Promise<PdfDigestResult> {
  if (!apiKey || !text.trim()) return { engine: "none", markdown: text, truncated: false };
  const endpoint = opts?.endpoint ?? GEMINI_OPENAI_ENDPOINT;
  const fetchFn = opts?.fetchFn ?? globalThis.fetch.bind(globalThis);
  const res = await fetchFn(`${endpoint}/chat/completions`, {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${apiKey}` },
    body: JSON.stringify(buildPdfDigestRequest(text, opts?.model)),
    signal: AbortSignal.timeout(60_000), // 행(hang) 방지 — timeout 시 throw → 호출부 원문 폴백
  });
  if (!res.ok) throw new Error(`[pdfdigest] HTTP ${res.status}`);
  const markdown = extractText(await res.json());
  return { engine: "gemini", markdown: markdown || text, truncated: text.length > DIGEST_MAX_CHARS };
}
