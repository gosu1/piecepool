import { describe, it, expect } from "vitest";
import { topicsForSelection, stripEvidenceSection } from "./noteSections";

// 사용자 시나리오: "## attention 을 드래그하면 attention + 소주제 전부가 되묻기 대상.
// 소주제만 드래그하면 그 소주제만."
const NOTE = [
  "# 딥러닝 노트", // 0
  "",
  "서두 텍스트.", // 헤딩 없는 서두
  "",
  "## attention", // ← 주제 1
  "쿼리와 키의 유사도로 가중치를 만든다.",
  "",
  "### scaled dot-product", // ← 주제 2 (attention 의 소주제)
  "√dk 로 나눈다.",
  "",
  "### multi-head", // ← 주제 3
  "여러 헤드를 병렬로 본다.",
  "",
  "## 임베딩", // ← 주제 4 (별개 ##)
  "토큰을 벡터로.",
].join("\n");

const at = (needle: string) => {
  const i = NOTE.indexOf(needle);
  if (i < 0) throw new Error(`fixture 에 없음: ${needle}`);
  return i;
};
const titles = (ts: { title: string }[]) => ts.map((t) => t.title);

describe("topicsForSelection", () => {
  it("## 을 드래그하면 자신 + 하위 ### 전부가 대상이다", () => {
    const ts = topicsForSelection(NOTE, at("## attention"), at("## attention") + 12);
    expect(titles(ts)).toEqual(["attention", "scaled dot-product", "multi-head"]);
    expect(ts[0].level).toBe(2);
    expect(ts[1].level).toBe(3);
  });

  it("## 의 text 는 하위 ### 본문을 전부 품고, 다음 ## 앞에서 끊긴다", () => {
    const [attention] = topicsForSelection(NOTE, at("## attention"), at("## attention") + 3);
    expect(attention.text).toContain("### multi-head");
    expect(attention.text).toContain("여러 헤드를 병렬로 본다.");
    expect(attention.text).not.toContain("## 임베딩");
  });

  it("### 안만 드래그하면 그 소주제 하나만 대상이다", () => {
    const ts = topicsForSelection(NOTE, at("√dk 로 나눈다."), at("√dk 로 나눈다.") + 5);
    expect(titles(ts)).toEqual(["scaled dot-product"]);
    expect(ts[0].text).not.toContain("multi-head");
  });

  it("선택이 여러 ## 에 걸치면 문서 순서로 전부 펼친다", () => {
    const ts = topicsForSelection(NOTE, at("## attention"), at("토큰을 벡터로."));
    expect(titles(ts)).toEqual(["attention", "scaled dot-product", "multi-head", "임베딩"]);
  });

  it("헤딩 없는 서두만 선택하면 대상이 없다 (H1 은 주제가 아니다)", () => {
    expect(topicsForSelection(NOTE, at("서두 텍스트."), at("서두 텍스트.") + 6)).toEqual([]);
    expect(topicsForSelection(NOTE, at("# 딥러닝 노트"), at("# 딥러닝 노트") + 5)).toEqual([]);
  });

  it("드래그 없이 우클릭(빈 선택)하면 그 지점의 섹션을 잡는다", () => {
    const p = at("여러 헤드를 병렬로 본다.");
    expect(titles(topicsForSelection(NOTE, p, p))).toEqual(["multi-head"]);
  });

  it("선택이 섹션 경계에서 끝나도 다음 섹션을 삼키지 않는다", () => {
    // "## attention" 줄 시작부터 "## 임베딩" 줄 시작 직전까지 = attention 섹션 전체
    const ts = topicsForSelection(NOTE, at("## attention"), at("## 임베딩"));
    expect(titles(ts)).toEqual(["attention", "scaled dot-product", "multi-head"]);
  });

  it("코드 펜스 안의 ## 은 헤딩이 아니다", () => {
    const md = ["## 진짜", "```md", "## 가짜", "```", "본문"].join("\n");
    const ts = topicsForSelection(md, 0, md.length);
    expect(titles(ts)).toEqual(["진짜"]);
    expect(ts[0].text).toContain("## 가짜"); // 본문으로는 포함된다
  });

  it("고아 ###(부모 ## 없음)도 단독 주제가 된다", () => {
    const md = ["# 제목", "### 홀로", "본문"].join("\n");
    expect(titles(topicsForSelection(md, at2(md, "본문"), at2(md, "본문") + 2))).toEqual(["홀로"]);
  });

  it("slug 는 normalizeTitle — 대소문자·공백 정규화", () => {
    const md = "##   Self  Attention  \n본문";
    const [t] = topicsForSelection(md, 0, md.length);
    expect(t.title).toBe("Self  Attention");
    expect(t.slug).toBe("self attention");
  });

  it("CRLF 노트에서도 오프셋과 제목이 맞는다", () => {
    const md = "## A\r\n본문 a\r\n### a1\r\n본문 a1\r\n";
    const ts = topicsForSelection(md, 0, 4);
    expect(titles(ts)).toEqual(["A", "a1"]);
    expect(md.slice(ts[1].from, ts[1].to)).toContain("본문 a1");
  });

  it("헤딩이 하나도 없으면 빈 배열", () => {
    expect(topicsForSelection("그냥 평범한 노트.", 0, 5)).toEqual([]);
  });

  // ── 적대적 리뷰가 잡은 회귀들 ──

  it("같은 제목의 소주제가 여럿이어도 상태 키는 겹치지 않는다", () => {
    // "예시"·"정리" 처럼 챕터마다 같은 소제목을 쓰는 건 노트의 정상 형태다.
    // key 가 겹치면 설명하지도 않은 섹션이 "이해함"으로 조회된다(PR3 게이트 fail-open).
    const md = ["## A", "본문", "### 예시", "a 예시", "## B", "본문", "### 예시", "b 예시"].join("\n");
    const ts = topicsForSelection(md, 0, md.length);
    expect(titles(ts)).toEqual(["A", "예시", "B", "예시"]);
    expect(ts.map((t) => t.key)).toEqual(["a", "예시", "b", "예시~1"]);
    expect(new Set(ts.map((t) => t.key)).size).toBe(4);
    // slug 는 제목 그대로 남는다 — 위키 개념 제목과 맞대볼 때 쓴다
    expect(ts[1].slug).toBe("예시");
    expect(ts[3].slug).toBe("예시");
  });

  it("제목의 밑줄은 지우지 않는다 — max_pooling 이 maxpooling 이 되면 안 된다", () => {
    const md = "## max_pooling\n본문";
    const [t] = topicsForSelection(md, 0, 5);
    expect(t.title).toBe("max_pooling");
    expect(t.slug).toBe("max_pooling");
  });

  it("강조 마커는 벗긴다", () => {
    const md = "## **중요** `코드`\n본문";
    expect(topicsForSelection(md, 0, 5)[0].title).toBe("중요 코드");
  });

  it("공백 3칸까지 들여쓴 헤딩도 헤딩이다 (4칸은 코드 블록)", () => {
    const md = ["## A", "본문", "   ### 들여쓴 소주제", "본문", "    #### 코드블록", "끝"].join("\n");
    const ts = topicsForSelection(md, 0, 4);
    expect(titles(ts)).toEqual(["A", "들여쓴 소주제"]);
  });

  it("제목 없는 `## ` 줄은 주제가 아니지만 섹션 경계다", () => {
    const md = ["## A", "a 본문", "## ", "고아 본문", "## B", "b 본문"].join("\n");
    const ts = topicsForSelection(md, 0, 4);
    expect(titles(ts)).toEqual(["A"]);
    expect(ts[0].text).not.toContain("고아 본문"); // 앞 섹션이 뒤를 삼키지 않는다
  });
});

function at2(md: string, needle: string): number {
  return md.indexOf(needle);
}

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
