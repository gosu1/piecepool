// ══ 쿼리바가 AI 에게 쥐어주는 도구 네 개 ══
//
// 보통은 필요한 자료를 미리 다 넣어서 보내지만, 위키가 늘어나면 전부 넣을 수 없다. 그래서
// "필요하면 이 기능을 불러"라고 알려주고 AI 가 요청하면 앱이 실행해서 결과를 돌려준다.
// 설계: "쿼리바 설계" §2.1~2.3.
//
// 규칙 셋:
//   1. 네 개 다 읽기만 한다. 아무것도 고치지 않으므로 실행 전 사용자 확인이 필요 없다
//   2. **절대 예외를 던지지 않는다.** AI 가 없는 과목·파일·소제목을 달라고 해도 앱이 죽으면
//      안 된다. "없어요"를 문자열로 돌려주면 AI 가 알아서 다른 걸 찾는다
//   3. 돌려주는 글은 다듬어서 준다(digestWiki) — 주고받을 때마다 지금까지 오간 내용 전체를
//      다시 보내므로, 한 번 넘긴 군더더기가 왕복 횟수만큼 불어난다

import * as ipc from "../lib/ipc";
import { scanHeadings, sectionEnd, stripEvidenceSection } from "../lib/noteSections";
import { stripFeynmanSection } from "../lib/feynmanSection";

/**
 * 소제목 없이 부를 때 본문을 통째로 줄 수 있는 상한(글자 수).
 *
 * 근거는 설계 문서 §2.2 — 가장 큰 호출을 2만 자 이하로 두고, 고정비(도구 설명서·질문·위키
 * 목록) 약 3,200자를 뺀 예산을 AI 가 보통 읽는 위키 두세 개로 나눈 값이다.
 * **시작값이다.** 실제 호출 크기를 재서 조정한다.
 */
export const WIKI_INLINE_LIMIT = 6000;

/** 목록에 붙이는 한 줄 요약의 길이 상한. */
const SUMMARY_LIMIT = 80;

const clip = (s: string, n: number): string => (s.length > n ? `${s.slice(0, n - 1)}…` : s);

/**
 * 본문의 첫 문단 — 목록에서 "이 위키가 무엇인지" 한 줄로 보여줄 때 쓴다.
 *
 * 위키는 `# 제목` 다음 첫 문단이 요약이라는 틀을 따른다(llmApply.ts conceptMarkdown).
 * 헤딩·빈 줄·목록 기호를 건너뛰고 처음 나오는 글 한 줄을 집는다.
 */
export function firstParagraph(markdown: string): string {
  for (const raw of markdown.split("\n")) {
    const line = raw.replace(/\r$/, "").trim();
    if (!line || line.startsWith("#") || line.startsWith("```")) continue;
    return clip(line.replace(/^[-*]\s*/, ""), SUMMARY_LIMIT);
  }
  return "";
}

/** 문서의 소제목(level 2 이상) 제목 목록. */
function subheadings(markdown: string): string[] {
  return scanHeadings(markdown)
    .filter((h) => h.level >= 2 && h.title)
    .map((h) => h.title);
}

/**
 * 위키 본문을 AI 에게 줄 형태로 다듬는다.
 *
 * 항상 걷어내는 것 — `## 근거`(PDF 임베드 목록이라 읽을 글이 없다), `## 파인만 기록`(파인만
 * 기능의 구역). 머리말은 걷어내지 않는다: 백엔드가 이미 벗겨서 준다(frontmatter.rs md_to_wiki).
 *
 * 소제목을 주면 그 구간만. 안 주면 상한 이하일 때 통째로, 넘으면 소제목 목록만 주고 다시
 * 부르라고 안내한다. 그 안내는 사람이 아니라 AI 가 읽고 스스로 판단한다.
 */
export function digestWiki(markdown: string, section?: string): string {
  const body = stripEvidenceSection(stripFeynmanSection(markdown)).trim();
  if (!body) return "(본문이 비어 있습니다)";

  const heads = scanHeadings(body);
  const names = subheadings(body);

  if (section?.trim()) {
    const want = section.normalize("NFC").trim();
    const i = heads.findIndex((h) => h.level >= 2 && h.title.normalize("NFC").trim() === want);
    if (i === -1) {
      return `"${section}" 이라는 소제목이 없습니다. 있는 소제목: ${names.join(" · ") || "(없음)"}`;
    }
    return body.slice(heads[i].from, sectionEnd(heads, i, body.length)).trim();
  }

  if (body.length <= WIKI_INLINE_LIMIT) return body;

  const head = body.slice(0, heads.find((h) => h.level >= 2)?.from ?? body.length).trim();
  return [
    clip(head, WIKI_INLINE_LIMIT / 4),
    "",
    `(본문이 ${body.length}자로 길어 앞부분만 보냅니다. 소제목: ${names.join(" · ")})`,
    "필요한 소제목을 section 인자로 지정해 read_wiki 를 다시 부르세요.",
  ].join("\n");
}

/** AI 에게 넘길 도구 설명서. OpenAI function calling 형식 그대로 Gemini 호환 창구에 보낸다. */
export const QUERY_TOOLS = [
  {
    type: "function" as const,
    function: {
      name: "list_spaces",
      description: "사용자의 지식 폴더 목록을 돌려준다. 어느 폴더에 무엇이 있는지 모를 때 가장 먼저 부른다.",
      parameters: { type: "object", properties: {}, required: [] },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "list_wiki",
      description: "지정한 지식 폴더 안의 위키 제목과 첫 줄 요약을 돌려준다. 어느 위키를 열지 고를 때 쓴다.",
      parameters: {
        type: "object",
        properties: { space: { type: "string", description: "지식 폴더 이름(slug)" } },
        required: ["space"],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "read_wiki",
      description:
        "위키 파일 하나의 본문을 돌려준다. 본문이 길면 소제목 목록만 돌려주므로, 그때는 section 을 지정해 다시 부른다.",
      parameters: {
        type: "object",
        properties: {
          space: { type: "string", description: "지식 폴더 이름(slug)" },
          file: { type: "string", description: "위키 파일명. list_wiki 가 돌려준 값을 그대로 쓴다" },
          section: { type: "string", description: "선택. 특정 소제목만 읽을 때" },
        },
        required: ["space", "file"],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "get_relations",
      description: "개념끼리 어떻게 이어져 있는지 관계 목록을 돌려준다. 본문을 열지 않고 개념 사이 관계만 알고 싶을 때 쓴다.",
      parameters: {
        type: "object",
        properties: { space: { type: "string", description: "지식 폴더 이름(slug)" } },
        required: ["space"],
      },
    },
  },
];

const str = (v: unknown): string => (typeof v === "string" ? v.trim() : "");

/**
 * 도구 하나를 실행하고 AI 에게 돌려줄 글을 만든다.
 *
 * **예외를 던지지 않는다.** 없는 과목·파일이든 IPC 실패든 전부 문자열로 돌려준다 —
 * 주고받기 도중 예외가 나면 대화 전체가 끊기지만, 문자열로 주면 AI 가 다시 시도할 수 있다.
 */
export async function runTool(name: string, args: Record<string, unknown> = {}): Promise<string> {
  try {
    switch (name) {
      case "list_spaces": {
        const spaces = await ipc.listSpaces();
        if (!spaces.length) return "지식 폴더가 아직 없습니다.";
        return spaces.map((s) => s.slug).join("\n");
      }

      case "list_wiki": {
        const space = str(args.space);
        if (!space) return "space 를 지정해야 합니다.";
        const pages = await ipc.listWiki(space);
        if (!pages.length) return `"${space}" 폴더에 위키가 없습니다.`;
        return pages.map((p) => `${p.path} | ${p.title} | ${firstParagraph(p.markdown)}`).join("\n");
      }

      case "read_wiki": {
        const space = str(args.space);
        const file = str(args.file);
        if (!space || !file) return "space 와 file 을 모두 지정해야 합니다.";
        const page = await ipc.readWiki(space, file);
        return `# ${page.title}\n\n${digestWiki(page.markdown, str(args.section) || undefined)}`;
      }

      case "get_relations": {
        const space = str(args.space);
        if (!space) return "space 를 지정해야 합니다.";
        const graph = await ipc.getGraph(space);
        if (!graph.relations.length) return `"${space}" 폴더에 기록된 관계가 없습니다.`;
        const title = new Map(graph.nodes.map((n) => [n.id, n.title]));
        return graph.relations
          .map((r) => `${title.get(r.sourceNodeId) ?? r.sourceNodeId} -[${r.relationType}]-> ${title.get(r.targetNodeId) ?? r.targetNodeId}`)
          .join("\n");
      }

      default:
        return `"${name}" 이라는 기능은 없습니다. 쓸 수 있는 것: ${QUERY_TOOLS.map((t) => t.function.name).join(", ")}`;
    }
  } catch (e) {
    return `실행하지 못했습니다: ${e instanceof Error ? e.message : String(e)}`;
  }
}
