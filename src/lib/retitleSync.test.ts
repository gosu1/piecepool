import { describe, it, expect } from "vitest";
import { retitleWikilinks, retitleLeadingH1 } from "./retitleSync";

describe("retitleWikilinks — [[옛제목]] → [[새제목]]", () => {
  it("정확 일치 링크만 바꾼다", () => {
    expect(retitleWikilinks("본문 [[어텐션]] 참고", "어텐션", "Attention")).toBe("본문 [[Attention]] 참고");
  });
  it("![[...]] 임베드는 건드리지 않는다 — 소스 파일 참조", () => {
    expect(retitleWikilinks("![[어텐션]] 그림과 [[어텐션]]", "어텐션", "Attention")).toBe("![[어텐션]] 그림과 [[Attention]]");
  });
  it("별칭·앵커 변형은 그대로(정확 일치만)", () => {
    const body = "[[어텐션|별칭]] [[어텐션#절]]";
    expect(retitleWikilinks(body, "어텐션", "Attention")).toBe(body);
  });
  it("제목의 정규식 메타문자를 이스케이프한다", () => {
    expect(retitleWikilinks("[[C++ (언어)]]", "C++ (언어)", "시플러스플러스")).toBe("[[시플러스플러스]]");
  });
  it("연속·복수 등장 전부 치환", () => {
    expect(retitleWikilinks("[[a]][[a]]\n[[a]]", "a", "b")).toBe("[[b]][[b]]\n[[b]]");
  });
});

describe("retitleLeadingH1 — 선두 H1 동기화", () => {
  it('선두 "# 옛제목" → "# 새제목"', () => {
    expect(retitleLeadingH1("# 어텐션\n\n본문", "어텐션", "Attention")).toBe("# Attention\n\n본문");
  });
  it("앞 빈 줄이 있어도 첫 비어있지 않은 줄로 판단", () => {
    expect(retitleLeadingH1("\n# 어텐션\n본문", "어텐션", "Attention")).toBe("\n# Attention\n본문");
  });
  it("선두가 아닌 H1·다른 제목은 그대로", () => {
    expect(retitleLeadingH1("본문\n# 어텐션", "어텐션", "Attention")).toBe("본문\n# 어텐션");
    expect(retitleLeadingH1("# 다른것\n", "어텐션", "Attention")).toBe("# 다른것\n");
  });
});
