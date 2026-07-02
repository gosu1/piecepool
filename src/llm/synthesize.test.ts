import { describe, it, expect } from "vitest";
import { runSynthesis, heuristicSynthesis, buildSynthesisBody, SynthesisStreamError } from "./synthesize";

function frame(obj: unknown): string {
  return `data: ${JSON.stringify(obj)}\n\n`;
}

function sseRes(...frames: string[]): Response {
  const enc = new TextEncoder();
  const body = new ReadableStream<Uint8Array>({
    start(c) {
      for (const f of frames) c.enqueue(enc.encode(f));
      c.close();
    },
  });
  return new Response(body, { status: 200 });
}

const INPUT = {
  sourceTitle: "OS 3주차",
  sourceText: "프로세스 vs 스레드\n\n- 컨텍스트 스위칭 비쌈\n스케줄러 -> 라운드로빈",
};

describe("buildSynthesisBody", () => {
  it("system 규칙 + 제목 지시 + 스트리밍 파라미터를 포함한다", () => {
    const b = buildSynthesisBody(INPUT);
    expect(b.model).toBe("gpt-5-mini");
    expect(b.input[0].content).toContain("모든 사실을 보존");
    expect(b.input[1].content).toContain("# OS 3주차 정리");
    expect(b.max_output_tokens).toBeGreaterThan(0);
  });
});

describe("runSynthesis — OpenAI 경로", () => {
  it("스트림 성공 → engine openai, delta 누적 텍스트 반환", async () => {
    const seen: string[] = [];
    const r = await runSynthesis(INPUT, "sk-test", {
      fetchFn: (async () =>
        sseRes(
          frame({ type: "response.output_text.delta", delta: "# OS 3주차 정리\n" }),
          frame({ type: "response.output_text.delta", delta: "본문" }),
          frame({ type: "response.completed", response: {} }),
        )) as unknown as typeof fetch,
      onDelta: (t) => seen.push(t),
      backoffMs: 0,
    });
    expect(r.engine).toBe("openai");
    expect(r.markdown).toBe("# OS 3주차 정리\n본문");
    expect(r.warning).toBeUndefined();
    expect(seen[seen.length - 1]).toBe("# OS 3주차 정리\n본문");
  });

  it("incomplete 종결 → 성공 + '일부만 생성됨' 경고", async () => {
    const r = await runSynthesis(INPUT, "sk-test", {
      fetchFn: (async () =>
        sseRes(
          frame({ type: "response.output_text.delta", delta: "부분" }),
          frame({ type: "response.incomplete", response: { incomplete_details: { reason: "max_output_tokens" } } }),
        )) as unknown as typeof fetch,
      backoffMs: 0,
    });
    expect(r.engine).toBe("openai");
    expect(r.warning).toContain("일부만 생성됨");
  });

  it("첫 delta 이전 실패는 재시도 후 휴리스틱 폴백 + warning", async () => {
    let calls = 0;
    const r = await runSynthesis(INPUT, "sk-test", {
      fetchFn: (async () => {
        calls++;
        throw new Error("network down");
      }) as unknown as typeof fetch,
      maxRetries: 2,
      backoffMs: 0,
    });
    expect(calls).toBe(3); // 1 + 재시도 2
    expect(r.engine).toBe("heuristic");
    expect(r.warning).toContain("network down");
  });

  it("401(auth) 은 재시도 없이 즉시 휴리스틱 폴백", async () => {
    let calls = 0;
    const r = await runSynthesis(INPUT, "sk-test", {
      fetchFn: (async () => {
        calls++;
        return new Response("{}", { status: 401 });
      }) as unknown as typeof fetch,
      maxRetries: 2,
      backoffMs: 0,
    });
    expect(calls).toBe(1);
    expect(r.engine).toBe("heuristic");
    expect(r.warning).toContain("auth");
  });

  it("첫 delta 이후 실패는 SynthesisStreamError — 휴리스틱 교체 없음", async () => {
    await expect(
      runSynthesis(INPUT, "sk-test", {
        fetchFn: (async () =>
          sseRes(
            frame({ type: "response.output_text.delta", delta: "반쯤 온 글" }),
            frame({ type: "error", message: "connection reset" }),
          )) as unknown as typeof fetch,
        backoffMs: 0,
      }),
    ).rejects.toBeInstanceOf(SynthesisStreamError);
  });

  it("AbortError 는 그대로 전파 (폴백 없음)", async () => {
    const abort = new Error("aborted");
    abort.name = "AbortError";
    await expect(
      runSynthesis(INPUT, "sk-test", {
        fetchFn: (async () => {
          throw abort;
        }) as unknown as typeof fetch,
        backoffMs: 0,
      }),
    ).rejects.toBe(abort);
  });
});

describe("runSynthesis — 키 없음 / heuristicSynthesis", () => {
  it("키 없으면 휴리스틱 즉시 반환, onDelta 1회(전체 텍스트)", async () => {
    const seen: string[] = [];
    const r = await runSynthesis(INPUT, "", { onDelta: (t) => seen.push(t) });
    expect(r.engine).toBe("heuristic");
    expect(seen).toEqual([r.markdown]);
  });

  it("원문의 모든 비공백 정보를 보존하고 결정적이다", async () => {
    const a = heuristicSynthesis(INPUT);
    const b = heuristicSynthesis(INPUT);
    expect(a.markdown).toBe(b.markdown);
    expect(a.markdown.startsWith("# OS 3주차 정리")).toBe(true);
    expect(a.markdown).toContain("프로세스 vs 스레드");
    expect(a.markdown).toContain("- 컨텍스트 스위칭 비쌈");
    expect(a.markdown).toContain("스케줄러 → 라운드로빈"); // -> 정규화
  });

  it("기존 헤딩은 유지(h1→h2 강등), 헤딩 없으면 ## 메모 아래로", async () => {
    const withHeading = heuristicSynthesis({ sourceTitle: "T", sourceText: "# 큰제목\n내용" });
    expect(withHeading.markdown).toContain("## 큰제목");
    expect(withHeading.markdown).not.toContain("## 메모");
    const noHeading = heuristicSynthesis({ sourceTitle: "T", sourceText: "그냥 메모" });
    expect(noHeading.markdown).toContain("## 메모");
  });

  it("코드펜스 내부는 원형 보존 (화살표 정규화 안 함)", async () => {
    const r = heuristicSynthesis({ sourceTitle: "T", sourceText: "```c\na -> b;\n```" });
    expect(r.markdown).toContain("a -> b;");
  });

  it("![[임베드]] 라인은 그대로 유지", async () => {
    const r = heuristicSynthesis({ sourceTitle: "T", sourceText: "![[lecture.pdf#page=3]]\n메모" });
    expect(r.markdown).toContain("![[lecture.pdf#page=3]]");
  });
});
