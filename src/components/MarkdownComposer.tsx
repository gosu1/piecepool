import type { KeyboardEvent } from "react";
import { useMemo, useRef, useState } from "react";
import type { LucideIcon } from "lucide-react";
import { CheckSquare, Code2, Heading1, Heading2, Heading3, Link2, List, ListOrdered, Minus, Quote, Table2 } from "lucide-react";

type MarkdownCommand = {
  id: string;
  label: string;
  detail: string;
  aliases: string[];
  icon: LucideIcon;
  insert: string;
  cursorOffset?: number;
};

const markdownCommands: MarkdownCommand[] = [
  {
    id: "h1",
    label: "제목 1",
    detail: "# 큰 제목",
    aliases: ["h1", "title", "heading1", "제목"],
    icon: Heading1,
    insert: "# ",
    cursorOffset: 2
  },
  {
    id: "h2",
    label: "제목 2",
    detail: "## 섹션 제목",
    aliases: ["h2", "heading2", "section", "소제목"],
    icon: Heading2,
    insert: "## ",
    cursorOffset: 3
  },
  {
    id: "h3",
    label: "제목 3",
    detail: "### 작은 제목",
    aliases: ["h3", "heading3"],
    icon: Heading3,
    insert: "### ",
    cursorOffset: 4
  },
  {
    id: "bullet",
    label: "글머리 목록",
    detail: "- 목록",
    aliases: ["bullet", "list", "ul", "목록"],
    icon: List,
    insert: "- ",
    cursorOffset: 2
  },
  {
    id: "number",
    label: "번호 목록",
    detail: "1. 목록",
    aliases: ["number", "ordered", "ol", "번호"],
    icon: ListOrdered,
    insert: "1. ",
    cursorOffset: 3
  },
  {
    id: "todo",
    label: "체크박스",
    detail: "- [ ] 할 일",
    aliases: ["todo", "task", "check", "checkbox", "할일", "체크"],
    icon: CheckSquare,
    insert: "- [ ] ",
    cursorOffset: 6
  },
  {
    id: "quote",
    label: "인용",
    detail: "> 인용문",
    aliases: ["quote", "blockquote", "인용"],
    icon: Quote,
    insert: "> ",
    cursorOffset: 2
  },
  {
    id: "code",
    label: "코드 블록",
    detail: "``` 코드 ```",
    aliases: ["code", "block", "코드"],
    icon: Code2,
    insert: "```\n\n```",
    cursorOffset: 4
  },
  {
    id: "divider",
    label: "구분선",
    detail: "---",
    aliases: ["divider", "hr", "line", "구분"],
    icon: Minus,
    insert: "---\n",
    cursorOffset: 4
  },
  {
    id: "table",
    label: "표",
    detail: "| 항목 | 내용 |",
    aliases: ["table", "표"],
    icon: Table2,
    insert: "| 항목 | 내용 |\n| --- | --- |\n|  |  |",
    cursorOffset: 29
  },
  {
    id: "link",
    label: "링크",
    detail: "[텍스트](URL)",
    aliases: ["link", "url", "링크"],
    icon: Link2,
    insert: "[텍스트](https://)",
    cursorOffset: 1
  }
];

type CommandState = {
  lineStart: number;
  caret: number;
  query: string;
};

function getCommandState(value: string, caret: number): CommandState | null {
  const lineStart = value.lastIndexOf("\n", Math.max(0, caret - 1)) + 1;
  const lineBeforeCaret = value.slice(lineStart, caret);
  const match = lineBeforeCaret.match(/^\/([^\s/]*)$/);

  if (!match) return null;

  return {
    lineStart,
    caret,
    query: match[1].toLowerCase()
  };
}

export function MarkdownComposer({
  value,
  onChange,
  placeholder
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
}) {
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const [commandState, setCommandState] = useState<CommandState | null>(null);
  const [selectedIndex, setSelectedIndex] = useState(0);

  const filteredCommands = useMemo(() => {
    if (!commandState) return [];
    const query = commandState.query;

    return markdownCommands.filter((command) => {
      const haystack = [command.label, command.detail, ...command.aliases].join(" ").toLowerCase();
      return haystack.includes(query);
    });
  }, [commandState]);

  const menuOpen = commandState !== null && filteredCommands.length > 0;
  const activeIndex = filteredCommands.length > 0 ? Math.min(selectedIndex, filteredCommands.length - 1) : 0;

  const updateCommandState = (nextValue: string, caret: number) => {
    setCommandState(getCommandState(nextValue, caret));
    setSelectedIndex(0);
  };

  const applyCommand = (command: MarkdownCommand) => {
    if (!commandState) return;

    const beforeLine = value.slice(0, commandState.lineStart);
    const afterCaret = value.slice(commandState.caret);
    const nextValue = `${beforeLine}${command.insert}${afterCaret}`;
    const nextCaret = commandState.lineStart + (command.cursorOffset ?? command.insert.length);

    onChange(nextValue);
    setCommandState(null);
    setSelectedIndex(0);

    requestAnimationFrame(() => {
      textareaRef.current?.focus();
      textareaRef.current?.setSelectionRange(nextCaret, nextCaret);
    });
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (!menuOpen) return;

    if (event.key === "ArrowDown") {
      event.preventDefault();
      setSelectedIndex((current) => (current + 1) % filteredCommands.length);
      return;
    }

    if (event.key === "ArrowUp") {
      event.preventDefault();
      setSelectedIndex((current) => (current - 1 + filteredCommands.length) % filteredCommands.length);
      return;
    }

    if (event.key === "Enter" || event.key === "Tab") {
      event.preventDefault();
      applyCommand(filteredCommands[activeIndex]);
      return;
    }

    if (event.key === "Escape") {
      event.preventDefault();
      setCommandState(null);
    }
  };

  return (
    <div className="relative">
      <textarea
        ref={textareaRef}
        className="min-h-64 w-full resize-y rounded-xl border border-line bg-mist px-4 py-4 text-sm leading-7 text-slate-700 outline-none transition placeholder:text-slate-400 focus:border-pool focus:bg-white"
        placeholder={placeholder}
        value={value}
        onChange={(event) => {
          onChange(event.target.value);
          updateCommandState(event.target.value, event.target.selectionStart);
        }}
        onClick={(event) => updateCommandState(event.currentTarget.value, event.currentTarget.selectionStart)}
        onKeyDown={handleKeyDown}
        onKeyUp={(event) => updateCommandState(event.currentTarget.value, event.currentTarget.selectionStart)}
      />

      {menuOpen ? (
        <div className="absolute left-3 top-14 z-40 w-[min(24rem,calc(100%-1.5rem))] overflow-hidden rounded-xl border border-line bg-white p-2 shadow-soft">
          <div className="max-h-72 overflow-auto">
            {filteredCommands.map((command, index) => {
              const Icon = command.icon;
              const active = index === activeIndex;

              return (
                <button
                  key={command.id}
                  className={`flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left transition ${
                    active ? "bg-ink text-white" : "text-slate-600 hover:bg-slate-100 hover:text-ink"
                  }`}
                  type="button"
                  onMouseDown={(event) => {
                    event.preventDefault();
                    applyCommand(command);
                  }}
                >
                  <span className={`grid h-8 w-8 shrink-0 place-items-center rounded-lg ${active ? "bg-white/10" : "bg-mist"}`}>
                    <Icon size={16} />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-black">{command.label}</span>
                    <span className={`block truncate text-xs font-semibold ${active ? "text-slate-300" : "text-slate-500"}`}>
                      {command.detail}
                    </span>
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      ) : null}
    </div>
  );
}
