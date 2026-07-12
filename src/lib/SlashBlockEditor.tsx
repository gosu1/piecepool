import { useEffect, useMemo, useRef } from "react";
import CodeMirror from "@uiw/react-codemirror";
import { markdown, insertNewlineContinueMarkup, deleteMarkupBackward } from "@codemirror/lang-markdown";
import { Decoration, EditorView, ViewPlugin, keymap, placeholder as cmPlaceholder } from "@codemirror/view";
import type { DecorationSet, ViewUpdate } from "@codemirror/view";
import { Prec, RangeSetBuilder } from "@codemirror/state";
import { HighlightStyle, syntaxHighlighting, syntaxTree } from "@codemirror/language";
import { tags } from "@lezer/highlight";
import { autocompletion, startCompletion, type Completion, type CompletionContext } from "@codemirror/autocomplete";
import { cn } from "../ds";
import { mathPreview } from "./cmMath";
import { calloutPreview, foldEasyCallouts } from "./cmCallout";
import { headingAction as headingActionExt, type HeadingAction } from "./cmHeadingAction";
import { toggleMark } from "./cmFormat";

// Notion식 CM6 캡처 에디터: "/" 슬래시 메뉴 + 마크다운 리스트 자동 이어짐 + ⌘Enter 제출.
// 테마는 DS 토큰 참조(라이트/다크 자동). 한글-first라 슬래시는 ASCII "/"에서만 트리거(IME 안전).
const theme = EditorView.theme({
  "&": { color: "var(--ds-ink)", fontSize: "15px" },
  ".cm-content": { fontFamily: "var(--font-sans)", caretColor: "var(--ds-ink)", lineHeight: "1.6" },
  "&.cm-focused": { outline: "none" },
  // CM6 기본 테마는 포커스 시 `&.cm-focused > .cm-scroller > .cm-selectionLayer .cm-selectionBackground` 로
  // #d7d4f0(연보라)을 박는다 — specificity 가 높아 `.cm-selectionBackground` 한 줄로는 못 이긴다.
  // 다크 테마에서 그 밝은 판이 글자를 삼켜 안 보였다. 같은 선택자로 되받아친다.
  // 선택 판은 앱 전역 ::selection(index.css)과 같은 색으로 — 회색 판은 다크에서 밝은 글자에 묻혔다.
  "&.cm-focused > .cm-scroller > .cm-selectionLayer .cm-selectionBackground, .cm-selectionLayer .cm-selectionBackground, & ::selection":
    { backgroundColor: "color-mix(in srgb, var(--ds-primary) 28%, transparent)" },
  ".cm-cursor": { borderLeftColor: "var(--ds-ink)" },
  ".cm-placeholder": { color: "var(--ds-ink-faint)" },
  // 헤딩 호버 액션 — 그 줄에 마우스를 올렸을 때만 나타난다(평소엔 글이 조용하다).
  ".pp-heading-action": {
    display: "none",
    marginLeft: "10px",
    verticalAlign: "middle",
    fontFamily: "var(--font-sans)",
    fontSize: "11px",
    fontWeight: "500",
    lineHeight: "1.4",
    color: "var(--ds-ink-faint)",
    backgroundColor: "var(--ds-fill-subtle)",
    border: "1px solid var(--ds-hairline)",
    borderRadius: "6px",
    padding: "2px 7px",
    cursor: "pointer",
    userSelect: "none",
  },
  ".cm-line:hover .pp-heading-action": { display: "inline-block" },
  ".pp-heading-action:hover": { color: "var(--ds-ink)", backgroundColor: "var(--ds-surface-soft)" },
  // 슬래시 메뉴 — Notion식 조용·airy: 12px 팝업 라운드 · 6px ul 인셋으로 선택 필(surface-soft) 부유 · 테두리 없는 22px 아이콘 타일(선택 시에만 fill-subtle 워시) · 11px/600 레터스페이스 아이브로우 · 단일 액센트(primary=매칭 텍스트) · 우측 키캡 칩 단축키 · 미들닷 푸터
  ".cm-tooltip.cm-tooltip-autocomplete": { backgroundColor: "var(--ds-surface)", border: "1px solid var(--ds-hairline)", borderRadius: "12px", boxShadow: "var(--shadow-elevated)", overflow: "hidden", minWidth: "300px", padding: "0" },
  ".cm-tooltip-autocomplete > ul": { maxHeight: "360px", padding: "6px", fontFamily: "var(--font-sans)" },
  ".cm-tooltip-autocomplete completion-section": { display: "block", padding: "10px 10px 5px", fontSize: "11px", fontWeight: "600", letterSpacing: "0.06em", color: "var(--ds-ink-faint)" },
  ".cm-tooltip-autocomplete ul li": { display: "flex", alignItems: "center", gap: "10px", margin: "0", padding: "7px 10px", borderRadius: "8px", color: "var(--ds-ink-2)", lineHeight: "1.3", cursor: "default" },
  ".cm-tooltip-autocomplete ul li[aria-selected]": { backgroundColor: "var(--ds-surface-soft)", color: "var(--ds-ink)" },
  ".pp-slash-ico": { flex: "0 0 auto", display: "inline-flex", alignItems: "center", justifyContent: "center", width: "22px", height: "22px", borderRadius: "5px", backgroundColor: "transparent", fontFamily: "var(--font-mono, ui-monospace, monospace)", fontSize: "11px", fontWeight: "500", lineHeight: "1", color: "var(--ds-ink-faint)" },
  ".cm-tooltip-autocomplete ul li[aria-selected] .pp-slash-ico": { backgroundColor: "var(--ds-fill-subtle)", color: "var(--ds-ink-2)" },
  ".cm-completionLabel": { flex: "1 1 auto", fontSize: "14px", fontWeight: "500", color: "inherit" },
  ".cm-completionMatchedText": { textDecoration: "none", fontWeight: "600", color: "var(--ds-primary)" },
  ".cm-completionDetail": { flex: "0 0 auto", marginLeft: "auto", fontStyle: "normal", fontFamily: "var(--font-mono, ui-monospace, monospace)", fontSize: "10px", fontWeight: "500", letterSpacing: "0.04em", textTransform: "uppercase", whiteSpace: "nowrap", color: "var(--ds-ink-muted)", backgroundColor: "var(--ds-fill-subtle)", border: "1px solid var(--ds-hairline)", borderRadius: "4px", padding: "1px 5px", lineHeight: "1.5" },
  ".cm-tooltip-autocomplete::after": { content: '"↑↓ 이동 · esc 닫기"', display: "block", padding: "8px 16px", borderTop: "1px solid var(--ds-hairline)", fontFamily: "var(--font-sans)", fontSize: "11px", fontWeight: "450", letterSpacing: "0.01em", color: "var(--ds-ink-faint)" },
});

// ── 라이브 프리뷰 ──
// CM6 기본 highlightStyle 은 heading 에 굵기만 준다(크기 없음) → "# 제목"을 쳐도 글자가 안 커진다.
// 마크다운 태그별로 실제 타이포를 입혀 타이핑과 동시에 문서처럼 보이게 한다.
// 마크업 기호는 커서가 닿지 않으면 감춘다(아래 hideMarkupMarks) — 편집하러 들어가면 다시 보이므로
// 원문(=저장물 archive)을 잃지 않는다.
const liveMarkdown = HighlightStyle.define([
  { tag: tags.heading1, fontSize: "1.75em", fontWeight: "700", lineHeight: "1.35", color: "var(--ds-ink)" },
  { tag: tags.heading2, fontSize: "1.4em", fontWeight: "700", lineHeight: "1.4", color: "var(--ds-ink)" },
  { tag: tags.heading3, fontSize: "1.18em", fontWeight: "600", color: "var(--ds-ink)" },
  { tag: [tags.heading4, tags.heading5, tags.heading6], fontWeight: "600", color: "var(--ds-ink)" },
  { tag: tags.strong, fontWeight: "700", color: "var(--ds-ink)" },
  { tag: tags.emphasis, fontStyle: "italic" },
  { tag: tags.strikethrough, textDecoration: "line-through", color: "var(--ds-ink-muted)" },
  { tag: tags.quote, color: "var(--ds-ink-muted)", fontStyle: "italic" },
  { tag: tags.link, color: "var(--ds-primary)" },
  { tag: tags.url, color: "var(--ds-ink-muted)" },
  { tag: tags.monospace, fontFamily: "var(--font-mono, ui-monospace, monospace)", fontSize: "0.92em", color: "var(--ds-ink)" },
  { tag: tags.contentSeparator, color: "var(--ds-ink-faint)" },
  // 마크업 기호 — 커서가 닿았을 때만 보이며, 크기는 주변 헤딩을 따라가고 색만 흐리다.
  { tag: tags.processingInstruction, color: "var(--ds-ink-faint)", fontWeight: "400" },
]);

// ── 마크업 기호(`# `, `**`, `*`) 감추기 — Obsidian/Notion 라이브 프리뷰 ──
// 커서가 닿지 않으면 기호를 화면에서 지운다. 문서는 그대로다(Decoration.replace 는 표시만 바꾼다).
// 편집하러 들어가면 다시 나타나므로 무엇이 저장되는지(archive 원문) 언제든 확인·수정할 수 있다.
//
// 헤딩은 줄 단위로 판단한다 — 한 줄에 하나뿐이고 줄 맨 앞이라 "그 줄에 있으면 보인다"가 자연스럽다.
// 볼드·기울임은 구간 단위다 — 한 줄에 여러 개라 줄 단위로 하면 관계없는 것까지 다 드러난다.
// 수식(cmMath)이 이미 구간 단위이고, 같은 감각이어야 한다.
const hiddenMark = Decoration.replace({});

function markupDecorations(view: EditorView): DecorationSet {
  const builder = new RangeSetBuilder<Decoration>();
  const doc = view.state.doc;
  const sel = view.state.selection.ranges;

  // 커서/선택이 걸친 줄 (헤딩 판단용)
  const activeLines = new Set<number>();
  for (const r of sel) {
    const first = doc.lineAt(r.from).number;
    const last = doc.lineAt(r.to).number;
    for (let n = first; n <= last; n++) activeLines.add(n);
  }
  // 커서/선택이 구간에 닿는가 — 양끝 인접 포함(cmMath 와 같은 규칙)
  const touches = (from: number, to: number) => sel.some((r) => r.from <= to && r.to >= from);

  for (const { from, to } of view.visibleRanges) {
    syntaxTree(view.state).iterate({
      from,
      to,
      enter: (node) => {
        if (node.name === "HeaderMark") {
          // Setext 헤딩(밑줄 `===`)의 마크는 줄 전체다 — 지우면 빈 줄만 남으므로 ATX("#")만 다룬다.
          if (doc.sliceString(node.from, node.from + 1) !== "#") return;
          if (activeLines.has(doc.lineAt(node.from).number)) return;
          // "# " 의 공백까지 함께 감춰야 제목이 왼쪽 끝에서 시작한다.
          const end = doc.sliceString(node.to, node.to + 1) === " " ? node.to + 1 : node.to;
          builder.add(node.from, end, hiddenMark);
          return;
        }
        // 볼드(**)·기울임(*)·취소선(~~) 의 여는/닫는 기호. 부모(Strong/Emphasis)가 통째로 커서에
        // 닿을 때만 드러내야 한다 — 기호 자체만 보면 여는 쪽과 닫는 쪽이 따로 놀아 한쪽만 나타난다.
        if (node.name !== "EmphasisMark" && node.name !== "StrikethroughMark") return;
        const parent = node.node.parent;
        if (!parent || touches(parent.from, parent.to)) return;
        builder.add(node.from, node.to, hiddenMark);
      },
    });
  }
  return builder.finish();
}

const hideMarkupMarks = ViewPlugin.fromClass(
  class {
    decorations: DecorationSet;
    constructor(view: EditorView) {
      this.decorations = markupDecorations(view);
    }
    update(u: ViewUpdate) {
      if (u.docChanged || u.selectionSet || u.viewportChanged) this.decorations = markupDecorations(u.view);
    }
  },
  {
    decorations: (v) => v.decorations,
    // 감춘 구간을 원자 단위로 — 좌우 화살표·backspace 가 보이지 않는 기호 안에 갇히지 않는다.
    provide: (plugin) => EditorView.atomicRanges.of((view) => view.plugin(plugin)?.decorations ?? Decoration.none),
  },
);

// 배경·패딩은 프레임 유무에 따라 분리 — frameless 는 패널에 그대로 녹아드는 Notion 본문(투명·수평 패딩 0).
const boxedFrame = EditorView.theme({
  "&": { backgroundColor: "var(--ds-surface)" },
  ".cm-content": { padding: "12px 14px" },
});
const framelessFrame = EditorView.theme({
  "&": { backgroundColor: "transparent" },
  ".cm-content": { padding: "10px 0" },
});

type SlashSection = { name: string; rank: number };
const SEC_BASIC: SlashSection = { name: "기본 블록", rank: 0 };
const SEC_INSERT: SlashSection = { name: "삽입", rank: 1 };

type SlashItem = { label: string; detail: string; insert: string; icon: string; section: SlashSection; cursor?: number };
const SLASH_ITEMS: SlashItem[] = [
  { label: "제목 1", detail: "# ", insert: "# ", icon: "H1", section: SEC_BASIC },
  { label: "제목 2", detail: "## ", insert: "## ", icon: "H2", section: SEC_BASIC },
  { label: "제목 3", detail: "### ", insert: "### ", icon: "H3", section: SEC_BASIC },
  { label: "글머리 목록", detail: "- ", insert: "- ", icon: "•", section: SEC_BASIC },
  { label: "번호 목록", detail: "1. ", insert: "1. ", icon: "1.", section: SEC_BASIC },
  { label: "할 일", detail: "- [ ] ", insert: "- [ ] ", icon: "☐", section: SEC_BASIC },
  { label: "인용", detail: "> ", insert: "> ", icon: "\"", section: SEC_BASIC },
  { label: "코드 블록", detail: "``` ```", insert: "```\n\n```", cursor: 4, icon: "<>", section: SEC_INSERT },
  { label: "콜아웃", detail: "> [!note]", insert: "> [!note] ", icon: "!", section: SEC_INSERT },
  { label: "수식", detail: "$$ … $$", insert: "$$\n\n$$", cursor: 3, icon: "∑", section: SEC_INSERT },
  { label: "쉬운 설명", detail: "> [!easy]", insert: "> [!easy] 쉬운 설명\n> ", icon: "?", section: SEC_INSERT },
  { label: "구분선", detail: "---", insert: "---\n", icon: "─", section: SEC_INSERT },
  { label: "출처 링크", detail: "[[ ... ]]", insert: "[[", icon: "[[", section: SEC_INSERT },
  { label: "임베드", detail: "![[ ... ]]", insert: "![[", icon: "![", section: SEC_INSERT },
];

// "/" 뒤 쿼리에서 슬래시 메뉴 제공. 줄 시작이거나 공백 뒤의 "/"에서만(http:// 같은 건 제외).
function slashSource(context: CompletionContext) {
  const line = context.state.doc.lineAt(context.pos);
  const before = line.text.slice(0, context.pos - line.from);
  const m = /\/([\w가-힣]*)$/.exec(before);
  if (!m) return null;
  if (!context.explicit && m.index > 0 && !/\s/.test(before[m.index - 1])) return null;
  // from = "/" 다음(쿼리 시작). CM 은 [from, cursor] 텍스트로 옵션을 필터하므로
  // "/" 를 포함하면 라벨과 안 맞아 전부 걸러진다. apply 에서 "/"까지 포함해 치환.
  const from = context.pos - m[1].length;
  const options: Completion[] = SLASH_ITEMS.map((it) => {
    const opt: Completion & { icon: string } = {
      label: it.label,
      detail: it.detail,
      section: it.section,
      icon: it.icon, // addToOptions 렌더에서 좌측 아이콘 박스로 읽음 (CM 표준 필드 아님)
      apply: (view, _completion, aFrom, aTo) => {
        const start = aFrom - 1; // 앞의 "/" 포함
        view.dispatch({ changes: { from: start, to: aTo, insert: it.insert }, selection: { anchor: start + (it.cursor ?? it.insert.length) } });
      },
    };
    return opt;
  });
  return { from, options };
}

// 안정 참조(렌더마다 새 객체면 @uiw 가 에디터 재구성 → 팝업 닫힘).
// syntaxHighlighting:false — @uiw 기본 defaultHighlightStyle 을 끄고 liveMarkdown 만 쓴다(둘 다 켜면 클래스가 겹친다).
const BASIC_SETUP = { lineNumbers: false, foldGutter: false, highlightActiveLine: false, autocompletion: false, syntaxHighlighting: false } as const;

// "/" 는 word 문자가 아니라 activateOnTyping 으로 자동 안 열림 → 삽입을 감지해 명시적으로 연다.
const slashTrigger = EditorView.updateListener.of((u) => {
  if (!u.docChanged) return;
  let typedSlash = false;
  u.changes.iterChanges((_fromA, _toA, _fromB, _toB, inserted) => {
    if (inserted.toString() === "/") typedSlash = true;
  });
  // updateListener 안에서 동기 dispatch 금지 → 마이크로태스크로 지연.
  if (typedSlash) queueMicrotask(() => startCompletion(u.view));
});

/** 드래그로 잡은 선택 범위 + 그 시작 지점의 화면 좌표(뷰포트 기준) */
export interface EditorSelection {
  from: number;
  to: number;
  x: number;
  y: number;
  /**
   * 오프셋의 기준이 되는 문서 본문. 부모가 갖고 있는 원본 문자열로 잘라 쓰면 안 된다 —
   * CM6 는 문서를 만들 때 CRLF 의 \r 을 없애므로, 윈도우에서 만든 노트에서는 부모의
   * 문자열과 오프셋이 줄 수만큼 어긋나 엉뚱한 섹션이 잡힌다.
   */
  doc: string;
}

export function SlashBlockEditor({
  value,
  onChange,
  onSubmit,
  onSelect,
  headingAction: heading,
  placeholder,
  height = "320px",
  className,
  frameless = false,
  readOnly = false,
  foldEasyKey = 0,
}: {
  value: string;
  onChange: (v: string) => void;
  onSubmit?: () => void;
  /** 드래그로 텍스트를 잡으면 그 범위·좌표를 올린다. 선택이 풀리면 null. */
  onSelect?: (sel: EditorSelection | null) => void;
  /** ##/### 제목 줄에 마우스를 올리면 제목 끝에 뜨는 버튼 (Notion 블록 핸들과 같은 결) */
  headingAction?: HeadingAction;
  placeholder?: string;
  height?: string;
  className?: string;
  /** 테두리·배경 없이 패널에 녹아드는 Notion 본문 모드 */
  frameless?: boolean;
  /** AI 스트리밍 중 편집 잠금 — 톱레벨 prop 이라 extensions 재구성 없음 */
  readOnly?: boolean;
  /** 값이 바뀔 때마다 [!easy] 콜아웃을 일괄 접는다 — 스트림 완료 시 부모가 올린다 */
  foldEasyKey?: number;
}) {
  const submitRef = useRef(onSubmit);
  submitRef.current = onSubmit;
  // onSubmit 과 같은 이유로 ref 우회 — extensions deps 에 넣으면 매 렌더 에디터가 재구성된다.
  const selRef = useRef(onSelect);
  selRef.current = onSelect;
  const headingRef = useRef(heading);
  headingRef.current = heading;
  const viewRef = useRef<EditorView | null>(null);
  useEffect(() => {
    if (foldEasyKey && viewRef.current) foldEasyCallouts(viewRef.current);
  }, [foldEasyKey]);

  // extensions 가 렌더마다 새 배열이면 @uiw/react-codemirror 가 매 입력마다 에디터를
  // 재구성해 슬래시 팝업이 즉시 닫힌다 → 안정 참조로 memo(onSubmit 은 ref 로 우회).
  const extensions = useMemo(
    () => [
      markdown(),
      syntaxHighlighting(liveMarkdown),
      hideMarkupMarks,
      headingActionExt(() => headingRef.current),
      mathPreview,
      calloutPreview,
      EditorView.lineWrapping,
      theme,
      frameless ? framelessFrame : boxedFrame,
      Prec.high(
        keymap.of([
          { key: "Enter", run: insertNewlineContinueMarkup },
          { key: "Backspace", run: deleteMarkupBackward },
          { key: "Mod-Enter", run: () => (submitRef.current?.(), true) },
          // 인라인 서식 — 다시 누르면 벗겨진다(토글).
          { key: "Mod-b", run: toggleMark("**") },
          { key: "Mod-i", run: toggleMark("*") },
        ]),
      ),
      slashTrigger,
      // 드래그로 텍스트를 잡으면 그 범위를 부모에게 올린다 — 부모가 선택 위에 액션 버튼을 띄운다.
      EditorView.updateListener.of((u) => {
        const notify = selRef.current;
        if (!notify || (!u.selectionSet && !u.docChanged && !u.geometryChanged)) return;
        const r = u.state.selection.main;
        const c = r.empty ? null : u.view.coordsAtPos(r.from);
        // doc 은 선택이 있을 때만 만든다 — 빈 선택(타이핑 중)에는 문자열을 복사하지 않는다.
        notify(c ? { from: r.from, to: r.to, x: c.left, y: c.top, doc: u.state.doc.toString() } : null);
      }),
      autocompletion({
        override: [slashSource],
        activateOnTyping: true,
        icons: false,
        addToOptions: [
          {
            position: 10, // 라벨(50)·detail(80) 앞 — 좌측 아이콘 박스
            render(completion) {
              const el = document.createElement("span");
              el.className = "pp-slash-ico";
              el.textContent = (completion as Completion & { icon?: string }).icon ?? "";
              return el;
            },
          },
        ],
      }),
      ...(placeholder ? [cmPlaceholder(placeholder)] : []),
    ],
    [placeholder, frameless],
  );

  return (
    <CodeMirror
      value={value}
      theme="none"
      height={height}
      extensions={extensions}
      onChange={onChange}
      readOnly={readOnly}
      onCreateEditor={(view) => {
        viewRef.current = view;
      }}
      basicSetup={BASIC_SETUP}
      className={cn(!frameless && "overflow-hidden rounded-md border border-hairline", className)}
    />
  );
}
