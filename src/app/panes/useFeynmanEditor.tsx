import { useState } from "react";
import { Icons, cn } from "../../ds";
import type { EditorSelection } from "../../lib/SlashBlockEditor";
import { topicsForSelection, wholeNoteTopics, type SectionTopic } from "../../lib/noteSections";
import { useFeynmanStore, hasGeminiKey } from "../../store/feynmanStore";
import { FeynmanPanel, type FeynmanHandlers } from "./FeynmanPanel";

// ══ 에디터에 파인만을 붙이는 배선 — 인박스 초안·저장된 노트가 공유한다 ══
//
// 두 가지 진입점을 준다:
//   1) 드래그  → 선택이 걸친 ##/### 섹션 (선택 위에 버튼이 뜬다)
//   2) 버튼    → 노트 전체 (섹션 전부. 헤딩이 없으면 글 전체가 주제 하나)

export interface FeynmanEditor {
  /** SlashBlockEditor 에 그대로 넘긴다 */
  onSelect: (sel: EditorSelection | null) => void;
  /** 선택 위에 뜨는 액션 버튼 + 노트 하단 Q&A 패널 */
  overlay: React.ReactNode;
  /** "글 전체를 파인만" — 현재 본문 전체를 대상으로 시작한다 */
  startWhole: () => void;
  /** 지금 파인만을 시작할 수 있는가 (키 있음 + 본문 있음) */
  canStart: boolean;
}

export function useFeynmanEditor(p: {
  noteId: string;
  space: string;
  /** 현재 편집 중인 본문 — "글 전체" 진입점이 쓴다 */
  markdown: string;
  noteTitle: string;
  handlers?: FeynmanHandlers;
}): FeynmanEditor {
  const [sel, setSel] = useState<EditorSelection | null>(null);
  const start = useFeynmanStore((s) => s.start);
  const keyed = hasGeminiKey();

  // 오프셋의 기준은 반드시 에디터가 준 sel.doc — 부모의 문자열로 자르면 CRLF 노트에서 어긋난다.
  const topics = sel ? topicsForSelection(sel.doc, sel.from, sel.to) : [];

  const begin = (ts: SectionTopic[]) => {
    if (!keyed || !ts.length) return;
    start(p.noteId, p.space, ts);
    setSel(null);
  };

  return {
    onSelect: setSel,
    startWhole: () => begin(wholeNoteTopics(p.markdown, p.noteTitle)),
    canStart: keyed && !!p.markdown.trim(),
    overlay: (
      <>
        {sel && topics.length > 0 && (
          <SelectionButton x={sel.x} y={sel.y} topics={topics} keyed={keyed} onStart={() => begin(topics)} />
        )}
        <FeynmanPanel noteId={p.noteId} handlers={p.handlers} />
      </>
    ),
  };
}

// 드래그한 선택 바로 위에 떠서 "이 주제로 파인만" 을 권한다 — 우클릭을 찾아 헤매지 않는다.
// 키가 없으면 감추지 않고 이유를 적은 채 비활성 — 감추면 기능이 없는 줄 안다.
function SelectionButton({
  x,
  y,
  topics,
  keyed,
  onStart,
}: {
  x: number;
  y: number;
  topics: SectionTopic[];
  keyed: boolean;
  onStart: () => void;
}) {
  const label = !keyed
    ? "파인만 — API 키 필요"
    : topics.length > 1
      ? `파인만 (주제 ${topics.length}개)`
      : `파인만 — ${topics[0].title}`;
  return (
    <div
      style={{ left: Math.max(8, Math.min(x, window.innerWidth - 240)), top: Math.max(8, y - 42) }}
      className="fixed z-50"
      // 클릭 전에 에디터가 포커스를 되찾아 선택이 풀리는 것을 막는다.
      onMouseDown={(e) => e.preventDefault()}
    >
      <button
        type="button"
        disabled={!keyed}
        onClick={onStart}
        className={cn(
          "flex items-center gap-1.5 rounded-lg border border-hairline bg-surface px-2.5 py-1.5 text-[13px] font-medium shadow-elevated transition-colors",
          keyed ? "text-ink-2 hover:bg-surface-soft hover:text-ink" : "cursor-default text-ink-faint",
        )}
      >
        <Icons.HelpCircleIcon size={13} />
        {label}
      </button>
    </div>
  );
}
