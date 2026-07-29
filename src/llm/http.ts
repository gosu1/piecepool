// 공용 재시도 프리미티브 — src/llm 전체가 이 한 벌을 쓴다(파일별 사본 금지).
// 재시도 채팅 호출 루프(chatJsonWithRetry)는 gemini.ts — endpoint 기본값이 필요해 provider 쪽에 있다.

/** ms 만큼 대기. backoff 는 호출부에서 backoffMs * 2 ** (attempt - 1) 규약. */
export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** unknown 오류 → 사람이 읽을 메시지. */
export function errMsg(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

/** fetch abort(타임아웃·사용자 취소) 여부. 최신 런타임의 DOMException 은 Error 를 상속하므로 함께 잡힌다. */
export function isAbort(e: unknown): boolean {
  return e instanceof Error && e.name === "AbortError";
}

/** 429·5xx·네트워크만 재시도한다. 401/400 은 재시도해도 같은 답이라 즉시 던진다. */
export function isRetriable(status: number): boolean {
  return status === 429 || status >= 500;
}
