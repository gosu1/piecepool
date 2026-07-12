// LLM 생성 언어 directive — 용어 혼용 규칙의 SSOT.
// 스펙: docs/superpowers/specs/2026-07-12-llm-output-language-design.md §4
// 노출 생성물 프롬프트(위키·파인만·간극질문·PDF요약·합성·OCR)가 이 블록을 주입받는다.
// tidy 는 예외 — 학생 문체 보존이 정체성이라 출력 언어를 강제하지 않는다.

import { getOutputLanguage, type OutputLanguage } from "../lib/settings";

export { getOutputLanguage, setOutputLanguage } from "../lib/settings";
export type { OutputLanguage } from "../lib/settings";

const KO_DIRECTIVE = [
  "서술은 한국어로 쓴다. 용어 표기 규칙:",
  '1. 입력 원문에 등장한 용어는 원문 표기를 그대로 따른다. (원문이 "mutex"면 mutex, "뮤텍스"면 뮤텍스)',
  "2. 원문에 없는 전문용어는 해당 분야에서 영어 원어가 통용되면 영어로 쓴다 (예: process, deadlock, gradient descent). 한국어 용어가 표준인 것은 한국어로 쓴다 (예: 미분, 수요곡선).",
  "3. 고유명사(알고리즘·라이브러리·인명)는 원어 표기.",
  "4. 영어 용어에 조사는 자연스럽게 붙인다 (deadlock은, mutex를).",
  "5. 문장 전체를 영어로 쓰지 않는다 — 영어는 용어 단위까지만.",
].join("\n");

const EN_DIRECTIVE =
  "Write all prose in English. Use standard English technical terminology; keep proper nouns in their original form.";

export function languageDirective(lang: OutputLanguage = getOutputLanguage()): string {
  return lang === "en" ? EN_DIRECTIVE : KO_DIRECTIVE;
}
