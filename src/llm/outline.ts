// PDF 추출 텍스트 → 학습 노트 뼈대가 될 '목차'(2단 헤딩) 생성. Gemini(OpenAI 호환 Chat Completions).
// 정답 주입 금지 — 추출 텍스트에 있는 주제만 목차로. 필기는 사용자가 헤딩 아래 직접 채운다.
// 키 없거나 실패면 목차 없이("") 폴백 — 호출부(importPdf)는 목차 없이 진행한다.

import { extractText } from "./ocr";
import { GEMINI_OPENAI_ENDPOINT, GEMINI_MODEL } from "./gemini";

export interface OutlineResult {
  markdown: string; // 2단 헤딩 목차(## 대주제 / ### 소주제). 키없음/실패면 ""
  engine: "gemini" | "none";
  truncated: boolean; // 입력이 상한을 넘어 잘렸는지
}

// 입력 상한 — 초과분은 잘라 보내고 잘림 사실을 모델에게 알린다.
export const OUTLINE_MAX_CHARS = 48_000;

const OUTLINE_INSTRUCTION =
  "아래는 PDF에서 추출한 텍스트다. 학습 노트의 뼈대가 될 '목차'만 마크다운으로 만들어라.\n" +
  "규칙:\n" +
  "- 대주제는 `## `, 소주제는 `### ` 헤딩으로 (최대 2단). 소주제가 없으면 대주제만.\n" +
  "- 주제 제목만 쓴다 — 설명·본문·정의는 쓰지 말 것.\n" +
  "- **반드시 아래 텍스트에 실제로 등장·설명된 주제만** 헤딩으로 삼는다. 표준 커리큘럼·상식이라도 원문에 없는 주제는 추가하지 마라. 애매하면 뺀다.\n" +
  "- 헤딩 아래는 비워 둔다(사용자가 직접 필기).\n" +
  "예:\n## 대주제 1\n### 소주제 1\n### 소주제 2\n## 대주제 2";

export function buildOutlineRequest(text: string, model = GEMINI_MODEL) {
  const clipped =
    text.length > OUTLINE_MAX_CHARS ? `${text.slice(0, OUTLINE_MAX_CHARS)}\n\n(입력 상한 초과 — 이후 내용 잘림)` : text;
  return {
    model,
    // temperature 0 — 목차는 창작이 아니라 추출. 모델이 표준 커리큘럼으로 채우는 것을 억제(원문 근거 원칙).
    temperature: 0,
    messages: [
      {
        role: "system",
        content:
          "너는 학습 자료의 목차를 잡아 주는 도우미다. 오직 주어진 PDF 추출 텍스트에 실제로 있는 주제만으로 계층을 뽑고, 원문에 없는 내용은 절대 지어내지 않는다.",
      },
      { role: "user", content: `${OUTLINE_INSTRUCTION}\n\n---\n\n${clipped}` },
    ],
  };
}

export async function runOutline(
  text: string,
  apiKey: string,
  opts?: { endpoint?: string; model?: string; fetchFn?: typeof fetch },
): Promise<OutlineResult> {
  if (!apiKey || !text.trim()) return { engine: "none", markdown: "", truncated: false };
  const endpoint = opts?.endpoint ?? GEMINI_OPENAI_ENDPOINT;
  const fetchFn = opts?.fetchFn ?? globalThis.fetch.bind(globalThis);
  const res = await fetchFn(`${endpoint}/chat/completions`, {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${apiKey}` },
    body: JSON.stringify(buildOutlineRequest(text, opts?.model)),
    signal: AbortSignal.timeout(60_000), // 행(hang) 방지 — timeout 시 throw → 호출부 목차 없이 폴백
  });
  if (!res.ok) throw new Error(`[outline] HTTP ${res.status}`);
  const markdown = extractText(await res.json());
  return { engine: "gemini", markdown, truncated: text.length > OUTLINE_MAX_CHARS };
}
