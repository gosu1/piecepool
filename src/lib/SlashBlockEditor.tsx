import { useMemo, useRef } from "react";
import CodeMirror from "@uiw/react-codemirror";
import { markdown, insertNewlineContinueMarkup, deleteMarkupBackward } from "@codemirror/lang-markdown";
import { EditorView, keymap, placeholder as cmPlaceholder } from "@codemirror/view";
import { Prec } from "@codemirror/state";
import { autocompletion, startCompletion, type Completion, type CompletionContext } from "@codemirror/autocomplete";
import { cn } from "../ds";

// Notion식 CM6 캡처 에디터: "/" 슬래시 메뉴 + 마크다운 리스트 자동 이어짐 + ⌘Enter 제출.
// 테마는 DS 토큰 참조(라이트/다크 자동). 한글-first라 슬래시는 ASCII "/"에서만 트리거(IME 안전).
const theme = EditorView.theme({
  "&": { color: "var(--ds-ink)", fontSize: "15px" },
  ".cm-content": { fontFamily: "var(--font-sans)", caretColor: "var(--ds-ink)", lineHeight: "1.6" },
  "&.cm-focused": { outline: "none" },
  ".cm-selectionBackground, & ::selection": { backgroundColor: "var(--ds-hairline)" },
  ".cm-cursor": { borderLeftColor: "var(--ds-ink)" },
  ".cm-placeholder": { color: "var(--ds-ink-faint)" },
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
const BASIC_SETUP = { lineNumbers: false, foldGutter: false, highlightActiveLine: false, autocompletion: false } as const;

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

export function SlashBlockEditor({
  value,
  onChange,
  onSubmit,
  placeholder,
  height = "320px",
  className,
  frameless = false,
}: {
  value: string;
  onChange: (v: string) => void;
  onSubmit?: () => void;
  placeholder?: string;
  height?: string;
  className?: string;
  /** 테두리·배경 없이 패널에 녹아드는 Notion 본문 모드 */
  frameless?: boolean;
}) {
  const submitRef = useRef(onSubmit);
  submitRef.current = onSubmit;

  // extensions 가 렌더마다 새 배열이면 @uiw/react-codemirror 가 매 입력마다 에디터를
  // 재구성해 슬래시 팝업이 즉시 닫힌다 → 안정 참조로 memo(onSubmit 은 ref 로 우회).
  const extensions = useMemo(
    () => [
      markdown(),
      EditorView.lineWrapping,
      theme,
      frameless ? framelessFrame : boxedFrame,
      Prec.high(
        keymap.of([
          { key: "Enter", run: insertNewlineContinueMarkup },
          { key: "Backspace", run: deleteMarkupBackward },
          { key: "Mod-Enter", run: () => (submitRef.current?.(), true) },
        ]),
      ),
      slashTrigger,
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
      basicSetup={BASIC_SETUP}
      className={cn(!frameless && "overflow-hidden rounded-md border border-hairline", className)}
    />
  );
}
