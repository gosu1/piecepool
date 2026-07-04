import { cn } from "../../ds";
import { useImportStore } from "../../store/importStore";
import { useConvertStore } from "../../store/convertStore";

// ══ 하단 상태바 — ImportJob 진행 점(importStore) + 정리 글 변환(convertStore) + 현재 경로 ══
const RUNNING = ["parsing", "archiving", "llm_processing", "clarify_pending", "writing"];
const STATUS_LABEL: Record<string, string> = {
  idle: "대기",
  parsing: "파싱",
  archiving: "원본 저장",
  llm_processing: "AI 위키 생성",
  clarify_pending: "응답 대기",
  writing: "위키 저장",
  completed: "완료",
  failed: "실패",
};
const CONVERT_RUNNING = ["streaming", "saving"];
const CONVERT_LABEL: Record<string, string> = {
  streaming: "정리 글 생성",
  saving: "정리 글 저장",
  done: "정리 글 완료",
  cancelled: "정리 글 중단",
  failed: "정리 글 실패",
};

export function StatusBar({ pathLabel, notice }: { pathLabel?: string; notice?: string }) {
  const job = useImportStore((s) => s.job);
  const convert = useConvertStore((s) => s.job);
  const dot =
    job?.status === "failed"
      ? "bg-danger"
      : job?.status === "completed"
        ? "bg-success"
        : job && RUNNING.includes(job.status)
          ? "bg-warning"
          : "bg-ink-faint";
  const convertDot =
    convert?.status === "failed"
      ? "bg-danger"
      : convert?.status === "done"
        ? "bg-success"
        : convert && CONVERT_RUNNING.includes(convert.status)
          ? "bg-warning"
          : "bg-ink-faint";

  return (
    <footer className="flex h-6 items-center gap-2 border-t border-hairline bg-chrome px-3 text-[11px] text-ink-muted tabular-nums">
      {job && job.status !== "idle" && (
        <span className="flex items-center gap-1.5">
          <span className={cn("h-1.5 w-1.5 rounded-full", dot)} />
          {STATUS_LABEL[job.status] ?? job.status}
          {job.status === "completed" && typeof job.wikiCount === "number" && ` · 위키 ${job.wikiCount} · 관계 ${job.relationCount}`}
        </span>
      )}
      {convert && convert.status !== "idle" && (
        <span className="flex items-center gap-1.5">
          <span className={cn("h-1.5 w-1.5 rounded-full", convertDot)} />
          {CONVERT_LABEL[convert.status] ?? convert.status}
          {convert.status === "streaming" && convert.text.length > 0 && ` · ${convert.text.length.toLocaleString()}자`}
        </span>
      )}
      {notice && <span className="truncate text-ink-2">{notice}</span>}
      <span className="flex-1" />
      {pathLabel && <span className="truncate text-ink-faint">{pathLabel}</span>}
    </footer>
  );
}
