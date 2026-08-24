import { describe, expect, it } from "vitest";
import { parseCommand, QUERY_COMMANDS, QUERY_SLASH_ITEMS } from "./commands";

describe("parseCommand", () => {
  it("아는 명령 넷을 읽는다", () => {
    expect(parseCommand("/lint")).toBe("lint");
    expect(parseCommand("/new")).toBe("new");
    expect(parseCommand("/sessions")).toBe("sessions");
    expect(parseCommand("/help")).toBe("help");
  });

  it("메뉴가 넣는 뒤쪽 공백을 넘긴다", () => {
    // 항목을 고르면 입력창에 "/lint " 가 들어간다 — 그 상태로 보내는 것이 기본 경로다
    expect(parseCommand("/lint ")).toBe("lint");
    expect(parseCommand("  /help  ")).toBe("help");
  });

  it("대소문자를 가리지 않는다", () => {
    expect(parseCommand("/LINT")).toBe("lint");
  });

  it("모르는 명령은 명령으로 보지 않는다 — 질문으로 넘어간다", () => {
    expect(parseCommand("/lnt")).toBeNull();
    expect(parseCommand("/위키")).toBeNull();
  });

  it("슬래시로 시작하지 않으면 명령이 아니다", () => {
    expect(parseCommand("lint 해줘")).toBeNull();
    expect(parseCommand("경로가 /home/me 인데 뭐였지")).toBeNull();
    expect(parseCommand("")).toBeNull();
  });
});

describe("QUERY_SLASH_ITEMS", () => {
  it("명령마다 항목이 하나씩 있고, 고르면 그 명령이 입력된다", () => {
    expect(QUERY_SLASH_ITEMS).toHaveLength(QUERY_COMMANDS.length);
    for (const it of QUERY_SLASH_ITEMS) {
      expect(parseCommand(it.insert)).toBe(it.alias);
    }
  });

  it("한글 이름으로 뜨고 영문 명령으로도 찾힌다", () => {
    const lint = QUERY_SLASH_ITEMS.find((i) => i.alias === "lint");
    expect(lint?.label).toBe("위키에 반영");
    expect(lint?.alias).toBe("lint");
  });
});
