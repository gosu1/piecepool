import { describe, it, expect } from "vitest";
import { errorHint } from "./FeynmanPanel";
import { probeExplanation, type Turn } from "../../llm/feynman";

// errorHint 는 feynman.ts 가 던지는 **문구**에 커플링돼 있다. 하드코딩한 문자열로 테스트하면
// 그 커플링을 검증하는 게 아니라 복사본을 검증하는 꼴이라, 프로듀서가 문구를 바꿔도 안 잡힌다.
// 그래서 실제로 probeExplanation 을 던지게 해서 그 에러를 그대로 먹인다.

const HISTORY: Turn[] = [{ role: "user", text: "설명" }];

/** probeExplanation 이 실제로 던지는 에러를 패널이 받는 그대로(String(e)) 돌려준다. */
async function thrownBy(fetchFn: typeof fetch): Promise<string> {
  try {
    await probeExplanation("개념", "본문", HISTORY, "test-key", { fetchFn, backoffMs: 0 });
  } catch (e) {
    return String(e);
  }
  throw new Error("던지지 않았다 — 목이 잘못됐다");
}

const status = (code: number) => async () => new Response("{}", { status: code });

describe("errorHint — 실패 원인을 사용자가 할 일로 번역한다", () => {
  it("429 는 기다리라고 한다 — 키를 고치라고 하면 안 된다", async () => {
    const hint = errorHint(await thrownBy(status(429)));
    expect(hint).toContain("잠시 후");
    expect(hint).not.toContain("키");
  });

  it("401·403 은 키를 보라고 한다 — 기다리라고 하면 안 된다", async () => {
    for (const code of [401, 403]) {
      const hint = errorHint(await thrownBy(status(code)));
      expect(hint).toContain("키");
      expect(hint).not.toContain("잠시 후");
    }
  });

  it("키가 없으면 설정으로 보낸다", async () => {
    let raw = "";
    try {
      await probeExplanation("개념", "본문", HISTORY, "", {});
    } catch (e) {
      raw = String(e);
    }
    expect(errorHint(raw)).toContain("설정");
  });

  it("네트워크 실패는 연결을 보라고 한다", async () => {
    const hint = errorHint(await thrownBy(async () => Promise.reject(new Error("Failed to fetch"))));
    expect(hint).toContain("연결");
  });

  it("구조화 출력 실패는 다시 시도하라고 한다", async () => {
    const ok = async () =>
      new Response(JSON.stringify({ choices: [{ message: { content: "{}" } }] }), { status: 200 });
    expect(errorHint(await thrownBy(ok))).toContain("다시 시도");
  });

  it("모르는 에러는 일반 문구로 떨어진다 — fail-safe", () => {
    // finish 의 readWiki/saveWiki 실패(Tauri IPC)는 위 어디에도 안 맞는다.
    expect(errorHint("Error: 디스크 죽음")).toBe("문제가 생겼어요.");
  });
});
