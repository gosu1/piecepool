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
  it("기록이 없으면 세션 0개 — body 는 정규화된 본문", () => {
    expect(splitFeynmanSection(BODY)).toEqual({ body: BODY, sessions: [], unparsed: [] });
    // body 는 md 그대로가 아니다 — 후행 개행은 섹션 유무와 무관하게 다듬는다.
    expect(splitFeynmanSection(`${BODY}\n\n`).body).toBe(BODY);
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

  // 섹션이 두 개가 되는 경로: LLM 창작(mergeWiki 출력)과 손편집. 첫 섹션만 걷으면
  // 남은 섹션이 다음 라운드에 진짜 기록을 body 로 흘려보낸다.
  it("섹션이 여러 개여도 전부 걷어낸다 — strip 은 멱등이다", () => {
    const md = `${BODY}\n\n## 파인만 기록\n\n### 가짜1\n\n> 창작1\n\n## 파인만 기록\n\n### 가짜2\n\n> 창작2\n`;
    const once = stripFeynmanSection(md);
    expect(once).toBe(BODY);
    expect(stripFeynmanSection(once)).toBe(once); // 멱등
  });

  it("섹션이 여러 개면 기록을 문서 순서로 합친다 — 아무것도 잃지 않는다", () => {
    const md = `${joinFeynmanSection(BODY, [S()])}\n\n## 파인만 기록\n\n### 가짜\n\n> 창작\n`;
    const { body, sessions, unparsed } = splitFeynmanSection(md);
    expect(body).toBe(BODY);
    expect(sessions).toEqual([S()]);
    expect(unparsed.join("\n")).toContain("창작");
  });

  it("split → join 이 섹션 하나로 정규화된다", () => {
    const md = `${BODY}\n\n## 파인만 기록\n\n### 가짜1\n\n> 창작1\n\n## 파인만 기록\n\n### 가짜2\n\n> 창작2\n`;
    const { body, sessions, unparsed } = splitFeynmanSection(md);
    const out = joinFeynmanSection(body, sessions, unparsed);
    expect(out.match(/^## 파인만 기록$/gm)).toHaveLength(1);
    // 두 창작 모두 보존된다 — 읽을 수 없다고 지우지 않는다
    expect(out).toContain("창작1");
    expect(out).toContain("창작2");
  });
});

describe("fail-closed — 파싱 못 한 기록을 조용히 삭제하지 않는다", () => {
  // 복기가 이 기능의 존재 이유다. at/verdict 를 못 읽는 것과 사용자 발화를 잃는 것은 전혀 다른 문제다.
  it("헤더가 망가져도 본문은 보존하고, 그 블록 원문을 unparsed 로 돌려준다", () => {
    const md = `${BODY}\n\n## 파인만 기록\n\n### 이건 헤더가 아니다\n\n> 소중한 발화\n`;
    const { body, sessions, unparsed } = splitFeynmanSection(md);
    expect(body).toBe(BODY);
    expect(sessions).toEqual([]);
    expect(unparsed.join("\n")).toContain("소중한 발화");
    expect(unparsed.join("\n")).toContain("### 이건 헤더가 아니다");
  });

  it("판정 문자열이 미상이면 그 세션을 unparsed 로 넘긴다 — 발화를 버리지 않는다", () => {
    const md = `${BODY}\n\n## 파인만 기록\n\n### 2026-07-16T12:00:00.000Z · 몰?루 · abc12345\n\n**나:**\n\n> 소중한 발화\n`;
    const { sessions, unparsed } = splitFeynmanSection(md);
    expect(sessions).toEqual([]);
    expect(unparsed.join("\n")).toContain("소중한 발화");
  });

  // 맨 객체 리터럴은 `constructor`·`__proto__` 를 truthy 로 돌려준다. 통과시키면 verdict 가
  // 함수 객체가 되어 UI 의 `=== "understood"` 가 거짓 → 사용자가 안 내린 판정을 표시한다.
  it.each(["constructor", "__proto__", "toString"])("prototype 키(%s)를 판정으로 받지 않는다", (key) => {
    const md = `${BODY}\n\n## 파인만 기록\n\n### 2026-07-16T12:00:00.000Z · ${key} · abc12345\n\n**나:**\n\n> 소중한 발화\n`;
    const { sessions, unparsed } = splitFeynmanSection(md);
    expect(sessions).toEqual([]);
    expect(unparsed.join("\n")).toContain("소중한 발화");
  });

  it.each(["constructor", "__proto__"])("prototype 키(%s)를 화자로 받지 않는다", (key) => {
    const md = `${BODY}\n\n## 파인만 기록\n\n### 2026-07-16T12:00:00.000Z · 이해함 · abc12345\n\n**${key}:**\n\n> 소중한 발화\n`;
    const turns = splitFeynmanSection(md).sessions[0]?.turns ?? [];
    expect(turns.every((t) => t.role === "user" || t.role === "probe")).toBe(true);
  });

  it("깨진 블록이 읽기→쓰기 사이클에서 살아남는다", () => {
    const md = `${BODY}\n\n## 파인만 기록\n\n### 이건 헤더가 아니다\n\n> 소중한 발화\n`;
    const { body, sessions, unparsed } = splitFeynmanSection(md);
    const out = joinFeynmanSection(body, sessions, unparsed);
    expect(out).toContain("소중한 발화");
    // 다시 읽어도 여전히 살아 있다 — 사이클을 반복해도 증발하지 않는다
    expect(splitFeynmanSection(out).unparsed.join("\n")).toContain("소중한 발화");
  });

  it("성한 세션과 깨진 블록이 섞여 있으면 둘 다 살린다", () => {
    const md = joinFeynmanSection(BODY, [S()]) + "\n\n### 깨진 헤더\n\n> 잃으면 안 되는 말\n";
    const { sessions, unparsed } = splitFeynmanSection(md);
    expect(sessions).toHaveLength(1);
    expect(unparsed.join("\n")).toContain("잃으면 안 되는 말");
  });

  it("unparsed 가 비면 섹션 모양이 그대로다 — 정상 경로에 흔적을 안 남긴다", () => {
    expect(joinFeynmanSection(BODY, [S()], [])).toBe(joinFeynmanSection(BODY, [S()]));
  });
});

describe("bodyHash", () => {
  it("세션 append 가 해시를 바꾸지 않는다 — 자기 자극 없음", () => {
    const h0 = bodyHash(BODY);
    expect(bodyHash(joinFeynmanSection(BODY, [S()]))).toBe(h0);
    expect(bodyHash(joinFeynmanSection(BODY, [S(), S({ at: "2026-01-01T00:00:00.000Z" })]))).toBe(h0);
  });

  // 후행 개행은 병합·편집을 거친 .md 의 정상 형태다. split 이 조건부로만 다듬으면
  // 기록 없는 페이지의 첫 세션에서 저장 전후 해시가 어긋나 배지가 상시 점등한다.
  it("후행 개행이 해시를 바꾸지 않는다 — split 이 섹션 유무와 무관하게 정규화한다", () => {
    expect(bodyHash(`${BODY}\n`)).toBe(bodyHash(BODY));
    expect(bodyHash(`${BODY}\n\n\n`)).toBe(bodyHash(BODY));
    expect(bodyHash(`${BODY}\r\n`)).toBe(bodyHash(BODY));
  });

  it("후행 개행 있는 본문의 첫 세션 — 저장 전후 해시가 같다", () => {
    // finish 가 하는 그대로: split → 해시 → join. 이 둘이 어긋나면 배지가 저장하자마자 켜진다.
    const withNl = `${BODY}\n`;
    const { body, sessions, unparsed } = splitFeynmanSection(withNl);
    const saved = joinFeynmanSection(body, [S({ bodyHash: bodyHash(body) }), ...sessions], unparsed);
    expect(splitFeynmanSection(saved).sessions[0].bodyHash).toBe(bodyHash(saved));
  });

  it("본문이 바뀌면 해시가 바뀐다", () => {
    expect(bodyHash(`${BODY} 추가`)).not.toBe(bodyHash(BODY));
  });

  it("CRLF/LF 차이가 해시를 바꾸지 않는다", () => {
    expect(bodyHash(BODY.replace(/\n/g, "\r\n"))).toBe(bodyHash(BODY));
  });
});
