import { describe, it, expect } from "vitest";
import { stripEvidenceSection } from "./noteSections";

describe("stripEvidenceSection", () => {
  it("`## 근거` 섹션(헤딩+임베드)을 걷어내고 나머지는 남긴다", () => {
    const md = ["# 프로세스", "본문 설명.", "", "## 근거", "![[lec3.pdf#page=4]]", "", "## 헷갈리는 개념", "- [[스레드]]"].join("\n");
    const out = stripEvidenceSection(md);
    expect(out).not.toContain("## 근거");
    expect(out).not.toContain("lec3.pdf");
    expect(out).toContain("본문 설명.");
    expect(out).toContain("## 헷갈리는 개념"); // 다음 섹션은 보존
    expect(out).toContain("[[스레드]]");
  });

  it("근거가 마지막 섹션이면 끝까지 걷어낸다", () => {
    const md = ["# 개념", "본문.", "", "## 근거", "![[a.pdf]]", "![[b.pdf#page=2]]"].join("\n");
    const out = stripEvidenceSection(md);
    expect(out).toContain("본문.");
    expect(out).not.toContain("근거");
    expect(out).not.toContain("a.pdf");
    expect(out).not.toContain("b.pdf");
  });

  it("코드 펜스 안의 `## 근거` 는 헤딩이 아니라 건드리지 않는다", () => {
    const md = ["# 개념", "```md", "## 근거", "![[x.pdf]]", "```", "본문."].join("\n");
    const out = stripEvidenceSection(md);
    expect(out).toContain("## 근거"); // 펜스 안이라 보존
    expect(out).toContain("x.pdf");
    expect(out).toContain("본문.");
  });

  it("근거 섹션이 없으면 원문 그대로", () => {
    const md = "# 개념\n본문만 있다.";
    expect(stripEvidenceSection(md)).toBe(md);
  });

  it("CRLF 본문에서도 근거만 정확히 걷어낸다", () => {
    const md = "# 개념\r\n본문.\r\n\r\n## 근거\r\n![[a.pdf]]\r\n\r\n## 관련\r\n뒤 본문.";
    const out = stripEvidenceSection(md);
    expect(out).not.toContain("근거");
    expect(out).not.toContain("a.pdf");
    expect(out).toContain("## 관련");
    expect(out).toContain("뒤 본문.");
  });

  it("`## 근거` 없이 본문에 인라인으로 박힌 단독 PDF 임베드도 걷어낸다 (휴리스틱 경로)", () => {
    const md = ["# 논문", "요약 텍스트.", "", "![[vlm-cometter.pdf]]", "", "## 1. 서론", "본문."].join("\n");
    const out = stripEvidenceSection(md);
    expect(out).not.toContain("vlm-cometter.pdf");
    expect(out).toContain("요약 텍스트.");
    expect(out).toContain("## 1. 서론");
  });

  it("PDF 아닌 임베드(이미지)와 코드펜스 안 PDF 임베드는 보존한다", () => {
    const md = ["# 개념", "![[diagram.png]]", "```md", "![[literal.pdf]]", "```", "본문."].join("\n");
    const out = stripEvidenceSection(md);
    expect(out).toContain("diagram.png"); // 이미지 임베드 유지
    expect(out).toContain("literal.pdf"); // 코드펜스 안이라 유지
  });
});
