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
  "&": { backgroundColor: "var(--ds-surface)", color: "var(--ds-ink)", fontSize: "15px" },
  ".cm-content": { fontFamily: "var(--font-sans)", caretColor: "var(--ds-ink)", padding: "12px 14px", lineHeight: "1.6" },
  "&.cm-focused": { outline: "none" },
  ".cm-selectionBackground, & ::selection": { backgroundColor: "var(--ds-hairline)" },
  ".cm-cursor": { borderLeftColor: "var(--ds-ink)" },
  ".cm-placeholder": { color: "var(--ds-ink-faint)" },
  ".cm-tooltip.cm-tooltip-autocomplete": {
    backgroundColor: "var(--ds-surface)",
    border: "1px solid var(--ds-hairline)",
    borderRadius: "8px",
    boxShadow: "var(--shadow-elevated)",
    overflow: "hidden",
  },
  ".cm-tooltip-autocomplete ul li": { padding: "5px 10px", color: "var(--ds-ink-2)", lineHeight: "1.4" },
  ".cm-tooltip-autocomplete ul li[aria-selected]": { backgroundColor: "var(--ds-surface-soft)", color: "var(--ds-ink)" },
  ".cm-completionDetail": { color: "var(--ds-ink-faint)", fontStyle: "normal", marginLeft: "8px" },
});

type SlashItem = { label: string; detail: string; insert: string; cursor?: number };
const SLASH_ITEMS: SlashItem[] = [
  { label: "제목 1", detail: "# ", insert: "# " },
  { label: "제목 2", detail: "## ", insert: "## " },
  { label: "제목 3", detail: "### ", insert: "### " },
  { label: "글머리 목록", detail: "- ", insert: "- " },
  { label: "번호 목록", detail: "1. ", insert: "1. " },
  { label: "할 일", detail: "- [ ] ", insert: "- [ ] " },
  { label: "인용", detail: "> ", insert: "> " },
  { label: "코드 블록", detail: "``` ```", insert: "```\n\n```", cursor: 4 },
  { label: "콜아웃", detail: "> [!note]", insert: "> [!note] " },
  { label: "구분선", detail: "---", insert: "---\n" },
  { label: "출처 링크", detail: "[[ ... ]]", insert: "[[" },
  { label: "임베드", detail: "![[ ... ]]", insert: "![[" },
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
  const options: Completion[] = SLASH_ITEMS.map((it) => ({
    label: it.label,
    detail: it.detail,
    type: "keyword",
    apply: (view, _completion, aFrom, aTo) => {
      const start = aFrom - 1; // 앞의 "/" 포함
      view.dispatch({ changes: { from: start, to: aTo, insert: it.insert }, selection: { anchor: start + (it.cursor ?? it.insert.length) } });
    },
  }));
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
}: {
  value: string;
  onChange: (v: string) => void;
  onSubmit?: () => void;
  placeholder?: string;
  height?: string;
  className?: string;
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
      Prec.high(
        keymap.of([
          { key: "Enter", run: insertNewlineContinueMarkup },
          { key: "Backspace", run: deleteMarkupBackward },
          { key: "Mod-Enter", run: () => (submitRef.current?.(), true) },
        ]),
      ),
      slashTrigger,
      autocompletion({ override: [slashSource], activateOnTyping: true, icons: false }),
      ...(placeholder ? [cmPlaceholder(placeholder)] : []),
    ],
    [placeholder],
  );

  return (
    <CodeMirror
      value={value}
      theme="none"
      height={height}
      extensions={extensions}
      onChange={onChange}
      basicSetup={BASIC_SETUP}
      className={cn("overflow-hidden rounded-md border border-hairline", className)}
    />
  );
}
