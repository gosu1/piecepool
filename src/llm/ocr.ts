// 이미지 → OCR/구조화 (README §LLM: 이미지 원본을 3-block 아카이브 노트로). OpenAI Responses API vision.
// SSOT: docs/30-llm/provider-config.md. 정답 주입 금지 — 이미지에 있는 것만 옮긴다.
// OCR 품질(실사진)은 사람 검증 대상. 요청 모양/오프라인 폴백/파싱은 자체검증.

export interface OcrResult {
  markdown: string;
  engine: "openai" | "none";
}

const OCR_INSTRUCTION =
  "이 이미지를 정확히 3개 블록의 마크다운으로 정리하라. 이미지에 없는 내용을 지어내지 말 것.\n" +
  "## 원문\n(보이는 텍스트를 그대로 옮긴다. 수식·기호·표 포함)\n" +
  "## 구조\n(제목·목록으로 재구성)\n" +
  "## 요약\n(핵심 3줄 이내)";

export function buildOcrRequest(dataUrl: string, model = "gpt-5-mini") {
  return {
    model,
    input: [
      { role: "system", content: "너는 학습 노트 OCR 도우미다. 손글씨/인쇄 텍스트를 정확히 옮기고 구조화한다." },
      {
        role: "user",
        content: [
          { type: "input_text", text: OCR_INSTRUCTION },
          { type: "input_image", image_url: dataUrl },
        ],
      },
    ],
  };
}

// Responses API 응답 → 평문 텍스트. pdfdigest.ts 도 재사용.
export function extractText(data: { output_text?: string; output?: Array<{ content?: Array<{ text?: string }> }> }): string {
  if (typeof data.output_text === "string") return data.output_text;
  const parts = (data.output ?? []).flatMap((o) => o.content ?? []);
  return parts
    .map((p) => p.text ?? "")
    .join("")
    .trim();
}

const OFFLINE_FALLBACK =
  "## 원문\n\n(이미지 OCR은 설정에서 OpenAI API 키를 입력하면 자동 인식됩니다. 지금은 원본만 첨부됩니다.)\n\n" +
  "## 구조\n\n- 원본 이미지는 Source(원본)에 보관됩니다.\n\n" +
  "## 요약\n\n- 키 입력 후 다시 시도하거나 텍스트를 직접 입력하세요.";

export async function runImageOcr(
  dataUrl: string,
  apiKey: string,
  opts?: { endpoint?: string; model?: string; fetchFn?: typeof fetch },
): Promise<OcrResult> {
  if (!apiKey) return { engine: "none", markdown: OFFLINE_FALLBACK };
  const endpoint = opts?.endpoint ?? "https://api.openai.com/v1";
  const fetchFn = opts?.fetchFn ?? globalThis.fetch;
  const res = await fetchFn(`${endpoint}/responses`, {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${apiKey}` },
    body: JSON.stringify(buildOcrRequest(dataUrl, opts?.model)),
  });
  if (!res.ok) throw new Error(`[ocr] HTTP ${res.status}`);
  const text = extractText(await res.json());
  return { engine: "openai", markdown: text || "## 원문\n\n(빈 응답)" };
}
