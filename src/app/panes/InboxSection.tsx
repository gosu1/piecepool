import { useState } from "react";
import { Button, Card, FileDropzone, cn } from "../../ds";
import type { WikiPage as WikiPageT, ArchiveNote } from "../../lib/types";
import { useImportStore } from "../../store/importStore";
import { runImageOcr } from "../../llm/ocr";

// ══ Inbox 섹션 ══
const IMPORT_STATUS_LABEL: Record<string, string> = {
  idle: "대기",
  parsing: "파싱",
  archiving: "원본 저장",
  llm_processing: "AI 위키 생성",
  clarify_pending: "응답 대기",
  writing: "위키 저장",
  completed: "완료",
  failed: "실패",
};

export function InboxSection({
  space,
  spaceId,
  spaceName,
  subjectIdsDefault,
  existing,
  notes,
  onOpenNote,
  onRefresh,
}: {
  space: string;
  spaceId: string;
  spaceName: string;
  subjectIdsDefault: string[];
  existing: WikiPageT[];
  notes: ArchiveNote[];
  onOpenNote: (n: ArchiveNote) => void;
  onRefresh: () => Promise<void> | void;
}) {
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [withLlm, setWithLlm] = useState(true);
  const [clarify, setClarify] = useState(false);
  const [answers, setAnswers] = useState<string[]>([]);
  const { job, gaps, runImport, respondClarify } = useImportStore();
  const busy = !!job && !["completed", "failed"].includes(job.status);

  const onFiles = (files: FileList) => {
    const f = files[0];
    if (!f) return;
    if (f.type.startsWith("text") || f.name.endsWith(".md") || f.name.endsWith(".txt")) {
      const reader = new FileReader();
      reader.onload = () => {
        setBody(String(reader.result ?? ""));
        if (!title) setTitle(f.name.replace(/\.[^.]+$/, ""));
      };
      reader.readAsText(f);
    } else if (f.type.startsWith("image")) {
      // 이미지 → OCR(vision)로 3-block 마크다운. 키 없으면 오프라인 폴백.
      const reader = new FileReader();
      reader.onload = async () => {
        const dataUrl = String(reader.result ?? "");
        if (!title) setTitle(f.name.replace(/\.[^.]+$/, ""));
        const apiKey = (typeof localStorage !== "undefined" && localStorage.getItem("openai-key")) || "";
        try {
          const { markdown } = await runImageOcr(dataUrl, apiKey);
          setBody((b) => (b ? b + "\n\n" : "") + markdown);
        } catch {
          setBody((b) => b + `\n\n> ${f.name} OCR 실패 — 텍스트를 직접 입력하세요.`);
        }
      };
      reader.readAsDataURL(f);
    } else {
      setBody((b) => b + `\n\n> ${f.name} 첨부됨 (PDF 추출은 Source에서)`);
      if (!title) setTitle(f.name.replace(/\.[^.]+$/, ""));
    }
  };

  const run = async () => {
    if (!title.trim() || busy) return;
    setAnswers([]);
    const res = await runImport({ space, spaceId, title: title.trim(), markdown: body, subjectIds: subjectIdsDefault, withLlm, clarify, existing });
    if (res.status === "completed") {
      setTitle("");
      setBody("");
      await onRefresh();
    }
  };

  const finishClarify = async (ans: string[] | null) => {
    const res = await respondClarify(ans);
    if (res.status === "completed") {
      setTitle("");
      setBody("");
      setAnswers([]);
      await onRefresh();
    }
  };

  const steps = withLlm
    ? clarify
      ? ["archiving", "llm_processing", "clarify_pending", "writing", "completed"]
      : ["archiving", "llm_processing", "writing", "completed"]
    : ["archiving", "writing", "completed"];
  const curIdx = job ? steps.indexOf(job.status) : -1;

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <h1 className="ds-h3 text-ink">Inbox</h1>
        <p className="text-[14px] text-ink-muted">{spaceName} · 자료 → 원본(archive) 저장 → (선택) AI 위키·관계 생성.</p>
      </div>

      <Card padding="lg" className="space-y-3">
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="제목"
          className="w-full bg-transparent text-[18px] font-bold text-ink outline-none placeholder:text-ink-faint"
        />
        <FileDropzone onFiles={onFiles} className="!p-6" />
        <textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          placeholder="마크다운으로 작성하세요…"
          rows={8}
          className="w-full rounded-md border border-hairline bg-surface p-3 text-[15px] leading-relaxed text-ink outline-none focus-visible:shadow-soft"
        />
        <div className="flex items-center justify-between">
          <div className="flex flex-col gap-1.5">
            <label className="flex items-center gap-2 text-[14px] text-ink-2">
              <input type="checkbox" checked={withLlm} onChange={(e) => setWithLlm(e.target.checked)} className="accent-primary" />
              AI 위키·관계까지 생성
            </label>
            <label className={cn("flex items-center gap-2 text-[13px]", withLlm ? "text-ink-muted" : "text-ink-faint")}>
              <input type="checkbox" checked={clarify} onChange={(e) => setClarify(e.target.checked)} disabled={!withLlm} className="accent-primary" />
              되묻기(clarify) — 저장 전 이해 확인
            </label>
          </div>
          <Button variant="solid" onClick={run} disabled={busy || !title.trim()}>
            {busy ? `${IMPORT_STATUS_LABEL[job!.status]}…` : withLlm ? "저장 + AI 정리" : "원본으로 저장"}
          </Button>
        </div>

        {job?.status === "clarify_pending" && (
          <div className="space-y-3 rounded-md border border-primary/40 bg-primary/[0.04] p-3">
            <p className="text-[14px] font-semibold text-ink">한 번 더 확인할게요 — 되묻기</p>
            {gaps.map((g, i) => (
              <div key={i} className="space-y-1.5">
                <p className="text-[14px] text-ink-2">{g.prompt}</p>
                <div className="flex flex-wrap gap-1.5">
                  {g.choices.map((c) => (
                    <button
                      key={c}
                      type="button"
                      onClick={() => setAnswers((a) => { const n = [...a]; n[i] = c; return n; })}
                      className={cn(
                        "rounded-full border px-2.5 py-1 text-[12px] transition-colors",
                        answers[i] === c ? "border-primary bg-primary text-on-primary" : "border-hairline text-ink-2",
                      )}
                    >
                      {c}
                    </button>
                  ))}
                </div>
                {g.allowOther && (
                  <input
                    value={answers[i] && !g.choices.includes(answers[i]) ? answers[i] : ""}
                    onChange={(e) => setAnswers((a) => { const n = [...a]; n[i] = e.target.value; return n; })}
                    placeholder="직접 설명(기타)"
                    className="w-full rounded border border-hairline bg-surface px-2 py-1 text-[13px] text-ink outline-none focus-visible:shadow-soft"
                  />
                )}
              </div>
            ))}
            <div className="flex justify-end gap-2">
              <Button size="sm" variant="utility" onClick={() => finishClarify(null)}>
                건너뛰기(1차 저장)
              </Button>
              <Button size="sm" variant="solid" onClick={() => finishClarify(answers)}>
                답변 반영해 생성
              </Button>
            </div>
          </div>
        )}

        {job && (
          <div className="rounded-md border border-hairline bg-surface-soft p-3 text-[13px]">
            {job.status === "failed" ? (
              <p className="text-danger">가져오기 실패: {job.errorMessage}</p>
            ) : (
              <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                {steps.map((s, i) => (
                  <span key={s} className="flex items-center gap-2">
                    {i > 0 && <span className="text-ink-faint">→</span>}
                    <span
                      className={cn(
                        "flex items-center gap-1.5",
                        job.status === "completed" || i < curIdx ? "text-ink-2" : i === curIdx ? "font-semibold text-primary" : "text-ink-faint",
                      )}
                    >
                      <span
                        className={cn(
                          "h-1.5 w-1.5 rounded-full",
                          job.status === "completed" || i < curIdx ? "bg-primary" : i === curIdx ? "bg-primary" : "bg-hairline",
                        )}
                      />
                      {IMPORT_STATUS_LABEL[s]}
                    </span>
                  </span>
                ))}
                {job.status === "completed" && (
                  <span className="ml-1 text-ink-muted">
                    · {job.engine === "openai" ? "GPT" : "휴리스틱"}
                    {typeof job.wikiCount === "number" && ` · 위키 ${job.wikiCount} · 관계 ${job.relationCount}`}
                    {job.mergedCount ? ` · 병합 ${job.mergedCount}` : ""}
                  </span>
                )}
              </div>
            )}
          </div>
        )}
      </Card>

      <div className="space-y-2">
        <p className="ds-eyebrow text-ink-faint">저장된 원본 ({notes.length})</p>
        {notes.length === 0 ? (
          <p className="text-[14px] text-ink-muted">아직 원본이 없습니다.</p>
        ) : (
          notes.map((n) => (
            <Card key={n.id} interactive padding="md" onClick={() => onOpenNote(n)}>
              <p className="text-[15px] font-semibold text-ink">{n.title}</p>
              <p className="text-[12px] text-ink-faint">
                {n.createdAt.slice(0, 10)} · {n.path}
              </p>
            </Card>
          ))
        )}
      </div>
    </div>
  );
}
