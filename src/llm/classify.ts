// [B] 정보 유형(Node Type) 분류 — 조각/문장을 6종으로 나눠 그래프에 색/필터/관계 규칙 부여.
// SSOT 설계: docs/30-llm/README.md §B "정보 유형(Node Type)".
//   concept 정의 · fact 사실/데이터 · claim 주장/논증 · example 예시 · method 방법/절차 · question 미해결 질문.
// 휴리스틱(무 LLM, 결정적) 코어. 우선순위 first-match + 정밀 가드(judge panel 설계 합성):
//   question > method > example > claim > fact > concept(폴백).
//   가드: 예시 도입 표지는 fact/claim/concept 압도 · claim은 fact 압도(당위/비교 프레이밍) ·
//        fact는 정의형 표지 없을 때만 concept 압도 · 고립 "먼저"는 method 아님(순서쌍/단계 필요) ·
//        wh-word 단독은 question 아님(? 또는 의문 어미 또는 미해결 표지 필요).
// ClassifyFn 주입형이라 LLM 분류기로 교체 가능(chunk.ts EmbedFn 패턴과 동형).

export type NodeType = "concept" | "fact" | "claim" | "example" | "method" | "question";

// 주입형 분류기 시그니처(LLM 분류기 교체용).
export type ClassifyFn = (text: string) => NodeType;

// ── question ────────────────────────────────────────────────
// 문장 끝 의문 어미 (트레일링 ? 없어도 인정).
const Q_ENDING = /(인가|은가|는가|을까|ㄹ까|일까|할까|나요|가능한가)\s*[?？]?\s*$/;
// 미해결 상태 표지 (?/어미 없이도 열린 질문).
const Q_UNRESOLVED = ["확실하지 않", "열린 문제", "인지 모르", "불분명", "의문"];
function isQuestion(text: string): boolean {
  if (/[?？]/.test(text)) return true;
  if (Q_ENDING.test(text.trim())) return true;
  return Q_UNRESOLVED.some((c) => text.includes(c));
}

// ── method ──────────────────────────────────────────────────
// 순서/단계 신호가 있어야 method. 고립 "먼저"·명사 "방법"만으로는 부족(과탐 방지).
const M_STRONG_SEQ = ["그다음", "그 다음", "다음으로", "그런 다음", "마지막으로", "이후에"];
const M_REQ = ["하려면", "려면", "하는 법", "한 뒤", "고 나서"];
const M_EN = ["how to", "in order to", "procedure", "algorithm:", "for each", "step "];
const M_NUMBERED = /^\s*\d+[.)]\s/;
const M_ORDINAL = /[①②③④⑤]/;
const M_FIRST_THEN = /first[,\s].*(then|next)/i;
function isMethod(text: string): boolean {
  const low = text.toLowerCase();
  if (M_NUMBERED.test(text) || M_ORDINAL.test(text)) return true;
  if (M_STRONG_SEQ.some((c) => text.includes(c))) return true;
  if (M_REQ.some((c) => text.includes(c))) return true;
  if (M_FIRST_THEN.test(text)) return true;
  return M_EN.some((c) => low.includes(c));
}

// ── example ─────────────────────────────────────────────────
// 명시적 도입 표지만. 있으면 내용에 수치/당위가 있어도 example(예시 프레이밍 우선).
const EX = [
  "예를 들어", "예를 들면", "예컨대", "가령", "이를테면", "일례로", "예시", "예:", "예)", "사례로", "대표적으로",
  "e.g.", "for example", "for instance", "such as", "as an example", "to illustrate", "case in point",
];
function isExample(text: string): boolean {
  const low = text.toLowerCase();
  return EX.some((c) => low.includes(c));
}

// ── claim ───────────────────────────────────────────────────
// 추론 연결어 / 당위 어미 / 평가·비교 술어. 수치가 있어도 claim 프레이밍이 우선(fact 압도).
const CL = [
  "따라서", "그러므로", "그래서", "결국", "왜냐하면", "때문에", "야 한다", "해야만", "여야",
  "하는 것이 좋다", "게 낫다", "편이 낫다", "바람직", "중요하다", "권장", "지양", "주장",
  "틀림없다", "명백히", "분명히", "우수하다", "우월하다", "유리하다", "강력하다", "더 빠르다", "더 효율적", "해서는 안",
  "therefore", "thus", "hence", "should", "must", "ought to", "better to", "better than",
  "outperforms", "it is important", "i argue", "we conclude", "need to", "clearly ",
];
function isClaim(text: string): boolean {
  const low = text.toLowerCase();
  return CL.some((c) => low.includes(c));
}

// ── fact ────────────────────────────────────────────────────
// 수치+단위 / 백분율 / 연도 / big-O / 데이터 동사. 정의형 표지가 함께면 concept로 양보(아래 가드).
const F_UNITS = /\d+\s*(%|퍼센트|년|월|일|개|배|번|회|초|ms|ns|μs|us|분|시간|khz|mhz|ghz|hz|kb|mb|gb|tb|bit|byte|비트|바이트|만|억|천)/i;
const F_BIGO = /[OΘΩ]\s*\(/;
const F_DATE = /\d{4}\s*년|(19|20)\d{2}/;
const F_KO = ["측정", "관측", "발표", "발견", "출시", "버전", "데이터에 따르면"];
const F_EN = ["measured", "observed", "released", "according to", "consists of", "billion", "million", "percent", "tokens", "parameters"];
function isFact(text: string): boolean {
  const low = text.toLowerCase();
  if (F_UNITS.test(text) || F_BIGO.test(text) || F_DATE.test(text)) return true;
  if (F_KO.some((c) => text.includes(c))) return true;
  return F_EN.some((c) => low.includes(c));
}

// ── concept ─────────────────────────────────────────────────
// 정의형 표지. fact 가드 + 폴백에 쓰인다(바로 이 표지가 있으면 수치가 있어도 정의로 본다).
const DEF_STRONG = [
  "란 ", "이란", "라 한다", "라고 한다", "이라고 한다", "라 불린다", "를 말한다", "을 말한다",
  "를 의미한다", "을 의미한다", "를 뜻한다", "로 정의", "정의된다", "라고 부른다",
  "is defined as", "refers to", "denotes", "is called", "known as", "definition of",
];
function hasStrongDef(text: string): boolean {
  const low = text.toLowerCase();
  return DEF_STRONG.some((c) => low.includes(c));
}

// 텍스트 → 6종 + 판정 근거. 우선순위 first-match, fact는 정의형 없을 때만, 나머지는 concept 폴백.
export function explain(text: string): { type: NodeType; reason: string } {
  if (isQuestion(text)) return { type: "question", reason: "의문부호/의문 어미/미해결 표지" };
  if (isMethod(text)) return { type: "method", reason: "순서·단계·절차 표지" };
  if (isExample(text)) return { type: "example", reason: "예시 도입 표지" };
  if (isClaim(text)) return { type: "claim", reason: "추론 연결어/당위/평가 표현" };
  if (isFact(text) && !hasStrongDef(text)) return { type: "fact", reason: "수치·단위·연도·big-O" };
  return { type: "concept", reason: hasStrongDef(text) ? "정의형 표현" : "폴백(specific 표지 없음)" };
}

// 텍스트 → 6종 중 하나.
export function classify(text: string): NodeType {
  return explain(text).type;
}

// ── §B 관계 타입 제약 (advisory) ────────────────────────────
// 문서 §B 명시 규칙: Claim→Fact(근거), Concept↔Concept(상위/하위), Example→Concept|Claim(예시).
// 그래프 엣지가 타입상 말이 되는지 힌트만 준다(강제 아님, promote와 같은 advisory).
const SENSIBLE_EDGES: Array<[NodeType, NodeType]> = [
  ["claim", "fact"],
  ["concept", "concept"],
  ["example", "concept"],
  ["example", "claim"],
];

// (source,target) 타입 조합이 §B상 유의미 엣지면 true, 명백히 어색하면 false, 미정의면 null(보류).
export function typeEdgeSensible(source: NodeType, target: NodeType): boolean | null {
  if (SENSIBLE_EDGES.some(([s, t]) => s === source && t === target)) return true;
  if (source === "question") return false; // 미해결 질문은 근거/구성요소의 출발점이 되기 어렵다
  return null;
}
