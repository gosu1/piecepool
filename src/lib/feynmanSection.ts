import { scanHeadings, sectionEnd } from "./noteSections";

// ══ 위키 본문의 `## 파인만 기록` 섹션 — 학습자가 그 개념을 자기 말로 설명한 기록 ══
//
// 위키 개념은 학습자가 만든 것이 아니다. 그래서 "이해했다"고 선언한 시점의 사고 과정을
// 개념과 같은 파일에 남긴다 — 나중에 복기할 때 그때의 자신을 다시 만나기 위해.
//
// frontmatter 가 아니라 본문인 이유: 자체 YAML 파서(storage/frontmatter.rs)가 개행·따옴표를
// 못 버틴다(yq 는 개행 미이스케이프, unquote 는 언이스케이프 미구현). 본문 섹션은 `## 근거`
// 선례가 있고 계약 변경이 필요 없다.
//
// 화자 마커(`**나:**`)를 인용 **밖**에 두는 것이 이 포맷의 핵심이다. 발화의 모든 줄에 `> ` 가
// 붙으므로 사용자는 인용 안 붙은 줄을 만들 수 없다 → 화자 경계가 위조 불가능하고 이스케이프가
// 통째로 불필요해진다.

export interface FeynmanTurn {
  role: "user" | "probe";
  text: string;
}

export interface FeynmanSession {
  /** ISO 8601. 표시 전용 — 문서 변경 판정에는 쓰지 않는다(bodyHash 가 한다). */
  at: string;
  /** 판정은 오직 사용자. LLM 은 채점하지 않는다. */
  verdict: "understood" | "not_yet";
  /** 설명 시점의 기록 제외 본문 해시. 현재 본문과 다르면 "이후 문서 바뀜". */
  bodyHash: string;
  turns: FeynmanTurn[];
}

const SECTION_TITLE = "파인만 기록";
const VERDICT_TO_LABEL: Record<FeynmanSession["verdict"], string> = { understood: "이해함", not_yet: "아직 모름" };
const LABEL_TO_VERDICT: Record<string, FeynmanSession["verdict"]> = { 이해함: "understood", "아직 모름": "not_yet" };
const ROLE_TO_LABEL: Record<FeynmanTurn["role"], string> = { user: "나", probe: "되묻기" };
const LABEL_TO_ROLE: Record<string, FeynmanTurn["role"]> = { 나: "user", 되묻기: "probe" };

const ROLE_LINE = /^\*\*(.+?):\*\*$/;
const SESSION_LINE = /^### (.+)$/;

const dropCr = (line: string) => (line.endsWith("\r") ? line.slice(0, -1) : line);

/** 기록 섹션의 [시작, 끝) 오프셋. 없으면 null. 코드펜스 안의 헤딩은 scanHeadings 가 이미 거른다. */
function locate(md: string): [number, number] | null {
  const headings = scanHeadings(md);
  for (let i = 0; i < headings.length; i++) {
    if (headings[i].level === 2 && headings[i].title === SECTION_TITLE) {
      return [headings[i].from, sectionEnd(headings, i, md.length)];
    }
  }
  return null;
}

/** 세션 블록 하나(헤더 줄 제외한 본문)의 발화들. */
function parseTurns(lines: string[]): FeynmanTurn[] {
  const turns: FeynmanTurn[] = [];
  let role: FeynmanTurn["role"] | null = null;
  let buf: string[] = [];
  const flush = () => {
    if (role) turns.push({ role, text: buf.join("\n") });
    buf = [];
  };
  for (const raw of lines) {
    const line = dropCr(raw);
    // 인용 안 붙은 줄만 화자 마커가 될 수 있다 — 사용자 발화는 전부 `>` 로 시작하므로 위조 불가.
    const m = !line.startsWith(">") && ROLE_LINE.exec(line);
    if (m && LABEL_TO_ROLE[m[1]]) {
      flush();
      role = LABEL_TO_ROLE[m[1]];
      continue;
    }
    if (!role) continue; // 첫 화자 마커 이전의 잡음
    if (line.startsWith(">")) buf.push(line.replace(/^> ?/, ""));
    // 인용 아닌 줄(포매팅용 빈 줄)은 버린다. 발화 내부 빈 줄은 `>` 로 저장되므로 여기 안 걸린다.
  }
  flush();
  return turns;
}

/**
 * 본문과 기록을 분리한다. 기록이 없으면 { body: md, sessions: [] }.
 * 헤더가 깨진 세션은 버리되 **본문은 언제나 온전히 복원한다** — 사용자 데이터를 조용히 잃지 않는다.
 */
export function splitFeynmanSection(md: string): { body: string; sessions: FeynmanSession[] } {
  const at = locate(md);
  if (!at) return { body: md, sessions: [] };
  const [from, to] = at;
  // CRLF 대응: 잘라낸 앞부분이 "...\r\n\r\n" 로 끝날 수 있다. `\n+$` 만으로는 마지막 \n 하나만
  // 지워져 \r 이 남는다 — \r? 를 단위에 포함해 (\r\n 또는 \n) 반복을 통째로 벗긴다.
  const body = (md.slice(0, from) + md.slice(to)).replace(/(\r?\n)+$/, "");
  const inner = md.slice(from, to).split("\n").slice(1); // `## 파인만 기록` 줄 제거

  const sessions: FeynmanSession[] = [];
  let header: string | null = null;
  let buf: string[] = [];
  const flush = () => {
    if (header === null) return;
    const parts = header.split(" · ").map((s) => s.trim());
    const verdict = LABEL_TO_VERDICT[parts[1] ?? ""];
    // 헤더를 못 읽으면 그 세션만 버린다. 시각·판정 없이는 복기에 쓸모가 없다.
    if (parts.length >= 2 && verdict) {
      sessions.push({ at: parts[0], verdict, bodyHash: parts[2] ?? "", turns: parseTurns(buf) });
    }
    buf = [];
  };
  for (const raw of inner) {
    const line = dropCr(raw);
    const m = SESSION_LINE.exec(line);
    if (m) {
      flush();
      header = m[1];
      continue;
    }
    buf.push(raw);
  }
  flush();
  return { body, sessions };
}

/** 본문 + 기록 → md. sessions 가 비면 섹션을 만들지 않는다. */
export function joinFeynmanSection(body: string, sessions: FeynmanSession[]): string {
  if (!sessions.length) return body;
  const out: string[] = [body.replace(/\n+$/, ""), "", `## ${SECTION_TITLE}`, ""];
  for (const s of sessions) {
    out.push(`### ${s.at} · ${VERDICT_TO_LABEL[s.verdict]} · ${s.bodyHash}`, "");
    for (const t of s.turns) {
      out.push(`**${ROLE_TO_LABEL[t.role]}:**`, "");
      // 빈 줄은 `>` — 후행 공백을 쓰면 포매터가 지워 발화 경계와 구분이 사라진다.
      for (const line of t.text.split("\n")) out.push(line ? `> ${line}` : ">");
      out.push("");
    }
  }
  return out.join("\n").replace(/\n+$/, "\n");
}

/** 표시·LLM 입력용 — 기록을 걷어낸 본문. */
export function stripFeynmanSection(md: string): string {
  return splitFeynmanSection(md).body;
}

/**
 * 기록 제외 본문의 해시(djb2, 8자). "이 설명 이후 문서 바뀜" 판정의 기준.
 *
 * updatedAt 을 쓰지 않는 이유: commands/wiki.rs:70 이 저장마다 무조건 updated_at 을 now 로
 * 덮으므로, 기록을 저장하는 행위 자체가 updatedAt 을 밀어 배지가 100% 오탐이 된다.
 * 해시는 기록을 걷어낸 뒤 계산하므로 세션 append 에 반응하지 않는다(자기 자극 없음).
 */
export function bodyHash(md: string): string {
  const b = stripFeynmanSection(md).replace(/\r\n/g, "\n");
  let h = 5381;
  for (let i = 0; i < b.length; i++) h = ((h << 5) + h + b.charCodeAt(i)) >>> 0;
  return h.toString(16);
}
