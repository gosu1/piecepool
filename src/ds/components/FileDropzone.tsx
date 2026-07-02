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

// 파일 업로드 영역 — 점선 드롭존 + 솔리드 버튼.
// 드랍은 accept 를 우회하므로 여기서 확장자/MIME 을 재검증한다. 같은 파일 재선택을 위해 input 은 매번 리셋.
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

  // accept("application/pdf,.md,image/*" 형식)에 맞는 파일만 통과.
  const matchesAccept = (f: File) => {
    const rules = accept.split(",").map((r) => r.trim().toLowerCase()).filter(Boolean);
    if (rules.length === 0) return true;
    const name = f.name.toLowerCase();
    const type = f.type.toLowerCase();
    return rules.some((r) => {
      if (r.startsWith(".")) return name.endsWith(r);
      if (r.endsWith("/*")) return type.startsWith(r.slice(0, -1));
      return type === r;
    });
  };

  const emit = (files: FileList) => {
    const ok = Array.from(files).filter(matchesAccept);
    if (ok.length === 0) return;
    const dt = new DataTransfer();
    ok.forEach((f) => dt.items.add(f));
    onFiles?.(dt.files);
  };

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
        if (e.dataTransfer.files?.length) emit(e.dataTransfer.files);
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
        multiple
        className="hidden"
        onChange={(e) => {
          if (e.target.files?.length) emit(e.target.files);
          // 같은 파일을 연속 선택해도 onChange 가 다시 발화하도록 리셋
          e.target.value = "";
        }}
      />
    </div>
  );
}
