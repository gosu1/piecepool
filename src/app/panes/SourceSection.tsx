import type { ReactNode } from "react";
import { Button, EmptyState, Icons } from "../../ds";
import type { ArchiveNote } from "../../lib/types";
import { ListItem } from "./ListItem";

// ══ Source 섹션 (유저 원본 문서 master-detail) ══
export function SourceSection({
  spaceName,
  notes,
  files,
  selected,
  onSelect,
  onGoInbox,
  children,
}: {
  spaceName: string;
  notes: ArchiveNote[];
  files: string[];
  selected: string;
  onSelect: (path: string) => void;
  onGoInbox: () => void;
  children: ReactNode;
}) {
  if (notes.length === 0 && files.length === 0) {
    return (
      <div className="mx-auto max-w-3xl space-y-5">
        <div>
          <h1 className="ds-h3 text-ink">Source</h1>
          <p className="text-[14px] text-ink-muted">{spaceName} · 내가 작성한 원본 문서</p>
        </div>
        <EmptyState
          icon={<Icons.FolderIcon size={28} />}
          title="아직 원본 문서가 없어요"
          description="인박스에서 글을 쓰거나 PDF·이미지를 올리면 원본이 여기에 모입니다."
          action={
            <Button variant="utility" size="sm" onClick={onGoInbox}>
              인박스로 이동
            </Button>
          }
        />
      </div>
    );
  }
  return (
    <div className="flex h-full min-h-[520px] gap-4">
      <div className="flex w-64 shrink-0 flex-col">
        <div className="mb-2">
          <h1 className="text-[18px] font-bold text-ink">Source</h1>
          <p className="text-[13px] text-ink-muted">{spaceName} · 원본 문서</p>
        </div>
        <div className="min-h-0 flex-1 space-y-1 overflow-y-auto">
          {notes.map((n) => (
            <ListItem
              key={n.id}
              icon={<Icons.FileUpIcon size={15} />}
              title={n.title}
              sub={n.createdAt.slice(0, 10)}
              active={selected === n.path}
              onClick={() => onSelect(n.path)}
            />
          ))}
          {files.map((f) => (
            <div key={f} className="flex items-center gap-2 rounded-md px-2.5 py-2 text-[14px] text-ink-muted">
              <Icons.FileIcon size={15} className="shrink-0 text-ink-faint" />
              <span className="truncate">{f}</span>
            </div>
          ))}
        </div>
      </div>
      <div className="min-w-0 flex-1 overflow-y-auto">{children}</div>
    </div>
  );
}
