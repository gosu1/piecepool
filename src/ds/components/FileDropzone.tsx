import { useRef, useState } from "react";
import { Button } from "../primitives/Button";
import { UploadCloudIcon } from "../icons";
import { cn } from "../lib/cn";

export interface FileDropzoneProps {
  title?: string;
  description?: string;
  buttonLabel?: string;
  accept?: string;
  onFiles?: (files: FileList) => void;
  className?: string;
}

// PDF 업로드 빈 상태 영역 — 점선 드롭존 + 솔리드 버튼
export function FileDropzone({
  title,
  description = "PDF 파일을 여기로 드래그하거나 클릭하여 선택하세요",
  buttonLabel = "파일 선택",
  accept = "application/pdf",
  onFiles,
  className,
}: FileDropzoneProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);

  return (
    <div
      onClick={() => inputRef.current?.click()}
      onDragOver={(e) => {
        e.preventDefault();
        setDragging(true);
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={(e) => {
        e.preventDefault();
        setDragging(false);
        if (e.dataTransfer.files?.length) onFiles?.(e.dataTransfer.files);
      }}
      className={cn(
        "flex cursor-pointer flex-col items-center justify-center gap-4 rounded-xl border-2 border-dashed p-12 text-center transition-colors",
        dragging ? "border-ink bg-surface-soft" : "border-hairline",
        className,
      )}
    >
      <UploadCloudIcon size={30} className="text-ink-faint" />
      {title && <p className="text-[15px] font-medium text-ink">{title}</p>}
      <p className="max-w-xs text-[15px] text-ink-muted">{description}</p>
      <Button
        variant="solid"
        onClick={(e) => {
          e.stopPropagation();
          inputRef.current?.click();
        }}
      >
        {buttonLabel}
      </Button>
      <input
        ref={inputRef}
        type="file"
        accept={accept}
        className="hidden"
        onChange={(e) => {
          if (e.target.files?.length) onFiles?.(e.target.files);
        }}
      />
    </div>
  );
}
