import { describe, it, expect } from "vitest";
import { splitFeynmanSection, joinFeynmanSection, stripFeynmanSection, bodyHash, type FeynmanSession } from "./feynmanSection";

const S = (over: Partial<FeynmanSession> = {}): FeynmanSession => ({
  at: "2026-07-16T12:03:11.123Z",
  verdict: "understood",
  bodyHash: "a1b2c3d4",
  turns: [
    { role: "user", text: "스레드는 메모리를 공유하는 실행 단위예요" },
    { role: "probe", text: "스택도 공유되나요?" },
  ],
  ...over,
});

const BODY = "# 스레드\n\n프로세스 안의 실행 단위.";

describe("splitFeynmanSection", () => {
  it("기록이 없으면 본문 그대로, 세션 0개", () => {
    expect(splitFeynmanSection(BODY)).toEqual({ body: BODY, sessions: [] });
  });

  it("라운드트립 — join 한 것을 split 하면 원래대로", () => {
    const sessions = [S()];
    const md = joinFeynmanSection(BODY, sessions);
    const back = splitFeynmanSection(md);
    expect(back.body).toBe(BODY);
    expect(back.sessions).toEqual(sessions);
  });

  it("세션 여러 개 — 순서 보존", () => {
    const sessions = [S({ at: "2026-07-16T12:00:00.000Z" }), S({ at: "2026-04-02T09:11:02.000Z", verdict: "not_yet" })];
    expect(splitFeynmanSection(joinFeynmanSection(BODY, sessions)).sessions).toEqual(sessions);
  });

  it("sessions 가 비면 섹션을 만들지 않는다", () => {
    expect(joinFeynmanSection(BODY, [])).toBe(BODY);
  });
});

describe("적대적 입력 — 사용자 발화가 포맷을 위조할 수 없다", () => {
  const rt = (text: string) => {
    const sessions = [S({ turns: [{ role: "user", text }] })];
    return splitFeynmanSection(joinFeynmanSection(BODY, sessions)).sessions[0].turns[0].text;
  };

  it("화자 마커를 발화에 써도 경계가 안 깨진다", () => {
    expect(rt("**나:** 안녕")).toBe("**나:** 안녕");
    expect(rt("**되묻기:** 가짜")).toBe("**되묻기:** 가짜");
  });

  it("세션 헤더를 발화에 써도 위조가 안 된다", () => {
    expect(rt("### 2026-01-01T00:00:00.000Z · 이해함 · deadbeef")).toBe("### 2026-01-01T00:00:00.000Z · 이해함 · deadbeef");
  });

  it("섹션 헤딩을 발화에 써도 위조가 안 된다", () => {
    expect(rt("## 파인만 기록")).toBe("## 파인만 기록");
  });

  it("인용문은 한 단계만 벗긴다", () => {
    expect(rt("> 교수님 말씀")).toBe("> 교수님 말씀");
    expect(rt(">> 이중 인용")).toBe(">> 이중 인용");
  });

  it("발화 내부 빈 줄이 발화 경계와 구분된다", () => {
    expect(rt("첫 문단\n\n둘째 문단")).toBe("첫 문단\n\n둘째 문단");
  });

  it("발화 내부 빈 줄이 두 발화로 쪼개지지 않는다", () => {
    const sessions = [S({ turns: [{ role: "user", text: "A\n\nB" }] })];
    expect(splitFeynmanSection(joinFeynmanSection(BODY, sessions)).sessions[0].turns).toHaveLength(1);
  });

  it("빈 줄 표기에 후행 공백을 쓰지 않는다 — 포매터가 지워도 안전", () => {
    const md = joinFeynmanSection(BODY, [S({ turns: [{ role: "user", text: "A\n\nB" }] })]);
    expect(md.split("\n").some((l) => l !== l.trimEnd())).toBe(false);
  });
});

describe("stripFeynmanSection", () => {
  it("본문 코드펜스 안의 `## 파인만 기록` 에 속지 않는다", () => {
    const md = "# 개념\n\n```md\n## 파인만 기록\n예시입니다\n```\n\n## 진짜 본문\n소중한 내용";
    expect(stripFeynmanSection(md)).toBe(md);
  });

  it("기록만 걷어내고 본문은 온전하다", () => {
    const md = joinFeynmanSection(BODY, [S()]);
    expect(stripFeynmanSection(md)).toBe(BODY);
  });

  it("기록 뒤에 다른 섹션이 있어도 그건 남긴다", () => {
    const body = `${BODY}\n\n## 근거\n\n![[a.pdf]]`;
    expect(stripFeynmanSection(joinFeynmanSection(body, [S()]))).toBe(body);
  });

  it("CRLF 본문에서도 동작한다", () => {
    const md = joinFeynmanSection(BODY, [S()]).replace(/\n/g, "\r\n");
    expect(stripFeynmanSection(md).replace(/\r\n/g, "\n")).toBe(BODY);
  });
});

describe("fail-closed — 깨진 기록을 조용히 삭제하지 않는다", () => {
  it("헤더가 망가진 세션은 버리되 원문 본문은 보존한다", () => {
    const md = `${BODY}\n\n## 파인만 기록\n\n### 이건 헤더가 아니다\n\n> 뭔가\n`;
    const { body, sessions } = splitFeynmanSection(md);
    expect(body).toBe(BODY);
    expect(sessions).toEqual([]);
  });

  it("판정 문자열이 미상이면 그 세션만 버린다", () => {
    const md = `${BODY}\n\n## 파인만 기록\n\n### 2026-07-16T12:00:00.000Z · 몰?루 · abc12345\n\n**나:**\n\n> 뭔가\n`;
    expect(splitFeynmanSection(md).sessions).toEqual([]);
  });
});

describe("bodyHash", () => {
  it("세션 append 가 해시를 바꾸지 않는다 — 자기 자극 없음", () => {
    const h0 = bodyHash(BODY);
    expect(bodyHash(joinFeynmanSection(BODY, [S()]))).toBe(h0);
    expect(bodyHash(joinFeynmanSection(BODY, [S(), S({ at: "2026-01-01T00:00:00.000Z" })]))).toBe(h0);
  });

  it("본문이 바뀌면 해시가 바뀐다", () => {
    expect(bodyHash(`${BODY} 추가`)).not.toBe(bodyHash(BODY));
  });

  it("CRLF/LF 차이가 해시를 바꾸지 않는다", () => {
    expect(bodyHash(BODY.replace(/\n/g, "\r\n"))).toBe(bodyHash(BODY));
  });
});
