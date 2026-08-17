// 개념 중복 판정 키(Concept.normalizedTitle)의 단일 구현.
// SSOT: docs/10-contracts/entities.md(Concept), llm-output-schema.md §6(dedup·merge).
//
// NFC → 소문자 → 공백 전부 제거. 공백을 한 칸으로 줄이지 않고 지우는 이유:
// 한글 개념은 띄어쓰기 표기가 흔들려("교착상태"/"교착 상태") collapse 로는 안 접히고
// 위키가 두 장 생긴다(PIE-64). 이 키는 병합 판정에만 쓰이고 표시 제목은 원문을
// 유지하므로, 영어 제목의 붙임("self attention"→"selfattention")은 노출되지 않는다.
//
// 규칙을 바꿀 때는 이 함수만 바꿔라 — validate(관계 known 집합)·dedupConcepts(응답 내
// 결합)·llmApply(기존 위키 merge)·generate(타입 Graph 노드 id)가 전부 여기에 걸려 있고,
// 서로 어긋나면 관계 드롭이나 파일 덮어쓰기 유실이 재발한다.
export function normalizeTitle(t: string): string {
  return t.normalize("NFC").toLowerCase().replace(/\s+/g, "");
}
