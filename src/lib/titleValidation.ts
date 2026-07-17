// ══ 제목 입력 검증 — 사용자 제목 생성·변경 공용 ══
//
// frontmatter 따옴표 이스케이프 왕복 파손을 입력 단계에서 차단한다: 실제로 왕복을
// 깨뜨리는 큰따옴표(")와 역슬래시(\)만 거부하고 나머지 문자는 모두 허용
// (storage/frontmatter.rs 의 yq 가 이스케이프하는 대상이 이 둘뿐이다).
// 사용자 입력에만 적용하고 LLM 생성 제목은 제한하지 않는다 —
// 저장 안전은 백엔드 unquote 복원이 담당하고, 이 검증은 이중 안전장치다.

const TITLE_FORBIDDEN = /["\\]/;

/** 허용되지 않는 문자가 있으면 인라인 안내 문구, 통과면 null.
 *  빈 문자열은 여기서 판단하지 않는다 — 저장 버튼 비활성이 담당한다. */
export function titleError(title: string): string | null {
  if (!title) return null;
  return TITLE_FORBIDDEN.test(title) ? "제목에는 큰따옴표(\")와 역슬래시(\\)를 쓸 수 없어요" : null;
}
