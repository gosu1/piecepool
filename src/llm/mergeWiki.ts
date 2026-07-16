// 위키 본문 축적(방식 A) — 기존 위키 본문 + 새 노트에서 추출한 같은 개념을 한 편의 글로 통합.
// 메인 위키 생성(gemini.ts)과 별개의 2차 호출이다. 실제로 병합이 일어나는 개념에만 호출한다 —
// 새 개념은 기존 본문이 없으므로 통합할 것도 없다.
//
// 한계(프로토타입 A 의 핵심 트레이드오프): LLM 이 기존 문장을 다시 쓴다. 사용자가 위키 편집기로
// 직접 쓴 문단을 건드리지 말라고 프롬프트로 지시하지만, 그것은 지시일 뿐 보장이 아니다.

import { GEMINI_OPENAI_ENDPOINT, taskModel, extractChatText } from "./gemini";
import { languageDirective, getOutputLanguage, type OutputLanguage } from "./language";
import type { LlmConcept } from "./provider";

/** 이 개념을 다시 가져온 원본 노트 — 통합 시 맥락으로 준다. */
export interface MergeSource {
  sourceId: string;
  title: string;
}

export interface MergeOptions {
  endpoint?: string;
  model?: string;
  fetchFn?: typeof fetch;
  lang?: OutputLanguage;
}

function newContentBlock(c: LlmConcept): string {
  const parts = [`요약: ${c.summary}`];
  if (c.explanation && c.explanation.trim() !== c.summary.trim()) parts.push(`설명: ${c.explanation.trim()}`);
  if (c.examples && c.examples.length) parts.push(`예시:\n${c.examples.map((e) => `- ${e}`).join("\n")}`);
  // sourceEmbeds 는 validate.ts(canonicalEmbed)가 이미 `![[file]]` 로 정규화해 넘긴다 — 그대로 준다.
  if (c.sourceEmbeds && c.sourceEmbeds.length) parts.push(`근거 임베드:\n${c.sourceEmbeds.join("\n")}`);
  if (c.confusingConcepts && c.confusingConcepts.length)
    parts.push(`헷갈리는 개념:\n${c.confusingConcepts.map((e) => `- [[${e}]]`).join("\n")}`);
  if (c.relatedQuestions && c.relatedQuestions.length)
    parts.push(`관련 질문:\n${c.relatedQuestions.map((q) => `- ${q}`).join("\n")}`);
  return parts.join("\n");
}

export function buildMergeBody(
  existingMarkdown: string,
  c: LlmConcept,
  source: MergeSource,
  model: string = taskModel("wikiMerge"),
  lang: OutputLanguage = getOutputLanguage(),
) {
  const system =
    "너는 학습 위키 편집자다. 같은 개념에 대해 이미 쌓인 위키 본문과, 새 노트에서 새로 추출한 내용을 " +
    "하나의 글로 통합한다. 이것은 교체가 아니라 축적이다.\n" +
    "[규칙 — 엄격]\n" +
    "1. 기존 본문에 있는 사실을 삭제하지 않는다. 새 내용과 겹치면 합치되, 어느 쪽 정보도 잃지 않는다.\n" +
    "2. 새 내용을 지어내 보태지 않는다. 주어진 두 재료 안에 있는 것만 쓴다.\n" +
    "3. 사용자가 직접 쓴 것으로 보이는 부분(LLM 문체가 아닌 메모·감상·'시험에 나온다' 같은 개인 기록)은 " +
    "   그대로 둔다. 다시 쓰지도, 옮기지도, 지우지도 않는다.\n" +
    "4. [[위키링크]]와 ![[임베드]]는 글자 그대로 유지한다 (수정·삭제 금지). 새 근거 임베드는 추가한다.\n" +
    `5. 첫 줄은 반드시 '# ${c.title}' 한 줄이다.\n` +
    "6. 출력은 순수 마크다운만. 설명 문장·코드펜스 감싸기 금지.\n" +
    "7. 출력 언어·용어 규칙:\n" +
    languageDirective(lang);
  const user =
    `[기존 위키 본문]\n${existingMarkdown}\n\n` +
    `[새 노트 "${source.title}" 에서 추출한 같은 개념]\n${newContentBlock(c)}\n\n` +
    "위 둘을 통합해 하나의 위키 본문으로 다시 써라.";
  return {
    model,
    messages: [
      { role: "system", content: system },
      { role: "user", content: user },
    ],
    temperature: 0.2,
  };
}

/** 통합된 본문 마크다운을 반환. 실패 시 throw — 호출부가 폴백(기존 본문 유지)을 결정한다. */
export async function runWikiMerge(
  existingMarkdown: string,
  c: LlmConcept,
  source: MergeSource,
  apiKey: string,
  opts?: MergeOptions,
): Promise<string> {
  const key = apiKey?.trim();
  if (!key) throw new Error("[mergeWiki] auth: GEMINI 키 없음");
  const endpoint = opts?.endpoint ?? GEMINI_OPENAI_ENDPOINT;
  const fetchFn = opts?.fetchFn ?? globalThis.fetch.bind(globalThis);
  const res = await fetchFn(`${endpoint}/chat/completions`, {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${key}` },
    body: JSON.stringify(buildMergeBody(existingMarkdown, c, source, opts?.model, opts?.lang)),
  });
  if (!res.ok) throw new Error(`[mergeWiki] HTTP ${res.status}`);
  const text = extractChatText(await res.json());
  // 빈 응답으로 기존 위키를 덮으면 지식이 통째로 사라진다 — 차라리 실패시킨다.
  if (!text.trim()) throw new Error("[mergeWiki] 빈 응답");
  return text;
}
