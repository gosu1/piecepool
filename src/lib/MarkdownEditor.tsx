import CodeMirror from "@uiw/react-codemirror";
import { markdown } from "@codemirror/lang-markdown";
import { EditorView } from "@codemirror/view";

// CodeMirror6 마크다운 에디터. 테마는 DS CSS 토큰(var(--ds-*))을 참조 → 라이트/다크 자동 전환.
const dsTheme = EditorView.theme({
  "&": { backgroundColor: "var(--ds-surface)", color: "var(--ds-ink)", fontSize: "14px", borderRadius: "6px" },
  ".cm-content": { fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace", caretColor: "var(--ds-ink)", padding: "12px 0" },
  ".cm-gutters": { backgroundColor: "var(--ds-surface-soft)", color: "var(--ds-ink-faint)", border: "none" },
  ".cm-activeLine": { backgroundColor: "color-mix(in srgb, var(--ds-surface-soft) 60%, transparent)" },
  ".cm-activeLineGutter": { backgroundColor: "var(--ds-surface-soft)" },
  "&.cm-focused": { outline: "none" },
  ".cm-selectionBackground, & ::selection": { backgroundColor: "var(--ds-hairline)" },
  ".cm-cursor": { borderLeftColor: "var(--ds-ink)" },
});

export function MarkdownEditor({ value, onChange, height = "480px" }: { value: string; onChange: (v: string) => void; height?: string }) {
  return (
    <CodeMirror
      value={value}
      height={height}
      extensions={[markdown(), EditorView.lineWrapping, dsTheme]}
      onChange={onChange}
      basicSetup={{ lineNumbers: true, foldGutter: false, highlightActiveLine: true, autocompletion: false }}
      className="overflow-hidden rounded-md border border-hairline"
    />
  );
}
