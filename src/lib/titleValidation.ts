// ══ 제목 입력 검증 — 사용자 제목 생성·변경 공용 ══
//
// frontmatter 따옴표 이스케이프 왕복 파손을 입력 단계에서 차단한다: 허용 문자를
// 한글(완성형+자모)·영문·숫자·공백·하이픈으로 제한. 사용자 입력에만 적용하고
// LLM 생성 제목은 제한하지 않는다 — 저장 안전은 백엔드 unquote 복원이 담당한다.

const TITLE_ALLOWED = /^[가-힣ㄱ-ㅎㅏ-ㅣA-Za-z0-9 -]+$/;

/** 허용되지 않는 문자가 있으면 인라인 안내 문구, 통과면 null.
 *  빈 문자열은 여기서 판단하지 않는다 — 저장 버튼 비활성이 담당한다. */
export function titleError(title: string): string | null {
  if (!title) return null;
  return TITLE_ALLOWED.test(title) ? null : "제목에는 한글·영문·숫자·공백·하이픈만 쓸 수 있어요";
}
