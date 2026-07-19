/// <reference types="vite/client" />

interface ImportMetaEnv {
  /**
   * (선택) 빌드 시 주입하는 데모용 Gemini API 키. 설정 모달에 저장된 키(gemini-key)가 우선이고,
   * 없을 때 이 값으로 폴백한다 — 심사위원이 키 발급 없이 바로 AI 기능을 쓰게 하는 데모 배포용.
   * 소스에 커밋하지 말 것(.env.local 또는 CI Secret 로 주입). 자세한 절차는 RUN_GUIDE 참고.
   */
  readonly VITE_GEMINI_API_KEY?: string;
}
