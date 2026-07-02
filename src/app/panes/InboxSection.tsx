import { useCallback, useEffect, useState } from "react";
import { Button, FileDropzone, cn } from "../../ds";
import type { WikiPage as WikiPageT, ArchiveNote } from "../../lib/types";
import * as ipc from "../../lib/ipc";
import { useImportStore } from "../../store/importStore";
import { runImageOcr } from "../../llm/ocr";
import { SlashBlockEditor } from "../../lib/SlashBlockEditor";
import { Markdown } from "../../lib/markdown";
import { FilePreview } from "../../lib/FilePreview";
import { getInboxView, setInboxView, type InboxView } from "../../lib/settings";

// ══ Inbox 섹션 — 분할 캡처 뷰 ══
// 2-split: NOTE(기존 원본 열람) | 새 페이지(작성)
// 3-split: PDF(원본 자료) | 새 페이지(source 작성) | Wiki(생성된 위키 참조)
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

function fileToBase64(f: File): Promise<string> {
  return new Promise((res, rej) => {
    const r = new FileReader();
    r.onload = () => res(String(r.result ?? "").split(",")[1] ?? "");
    r.onerror = () => rej(r.error);
    r.readAsDataURL(f);
  });
}

export function InboxSection({
  space,
  spaceId,
  spaceName,
  subjectIdsDefault,
  existing,
  notes,
  onOpenNote,
  onOpenWiki,
  onRefresh,
}: {
  space: string;
  spaceId: string;
  spaceName: string;
  subjectIdsDefault: string[];
  existing: WikiPageT[];
  notes: ArchiveNote[];
  onOpenNote: (n: ArchiveNote) => void;
  onOpenWiki: (file: string) => void;
  onRefresh: () => Promise<void> | void;
}) {
  const [view, setView] = useState<InboxView>(getInboxView());
  const changeView = (v: InboxView) => {
    setInboxView(v);
    setView(v);
  };

  // ── 작성(새 페이지) 상태 ──
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [withLlm, setWithLlm] = useState(true);
  const [clarify, setClarify] = useState(false);
  const [answers, setAnswers] = useState<string[]>([]);
  const { job, gaps, runImport, respondClarify } = useImportStore();
  const busy = !!job && !["completed", "failed"].includes(job.status);

  // ── 참조 패널 상태 ──
  const [refNotePath, setRefNotePath] = useState<string>("");
  const [refWikiPath, setRefWikiPath] = useState<string>("");
  const [sources, setSources] = useState<string[]>([]);
  const [refSource, setRefSource] = useState<string>("");
  const [pdfBusy, setPdfBusy] = useState(false);

  const refNote = notes.find((n) => n.path === refNotePath) ?? notes[0];
  const refWiki = existing.find((w) => w.path === refWikiPath) ?? existing[0];

  const loadSources = useCallback(async () => {
    try {
      const list = await ipc.listSources(space);
      setSources(list);
      setRefSource((cur) => (cur && list.includes(cur) ? cur : (list[0] ?? "")));
    } catch {
      setSources([]);
    }
  }, [space]);

  useEffect(() => {
    if (view === "3") void loadSources();
  }, [view, loadSources]);

  // PDF → sources/original-files 저장 + 텍스트 추출 → 에디터에 삽입 (Inbox PDF 임포트 경로)
  const importPdf = async (f: File) => {
    setPdfBusy(true);
    try {
      const stored = await ipc.saveSourceFile(space, f.name, await fileToBase64(f));
      await loadSources();
      setRefSource(stored);
      setTitle((t) => t || f.name.replace(/\.[^.]+$/, ""));
      try {
        const ext = await ipc.extractPdfText(space, stored);
        const text = ext.pages.map((p) => p.text).join("\n\n").trim();
        setBody((b) => (b ? b + "\n\n" : "") + `![[${stored}]]\n\n${text}`);
      } catch {
        setBody((b) => (b ? b + "\n\n" : "") + `![[${stored}]]\n\n> PDF 텍스트 추출 실패 — 스캔본이면 이미지로 올려 OCR 하세요.`);
      }
    } catch (e) {
      setBody((b) => b + `\n\n> ${f.name} 저장 실패: ${String(e)}`);
    } finally {
      setPdfBusy(false);
    }
  };

  // 파일 1개 처리 — 여러 개 드랍/선택 시 각각 순서대로 에디터에 누적된다.
  const addFile = (f: File) => {
    const stem = f.name.replace(/\.[^.]+$/, "");
    if (f.type.startsWith("text") || /\.(md|markdown|txt)$/i.test(f.name)) {
      const reader = new FileReader();
      reader.onload = () => {
        const text = String(reader.result ?? "").trim();
        setBody((b) => (b ? b + "\n\n" : "") + text);
        setTitle((t) => t || stem);
      };
      reader.readAsText(f);
    } else if (f.type.startsWith("image")) {
      // 이미지 → OCR(vision)로 3-block 마크다운. 키 없으면 오프라인 폴백.
      const reader = new FileReader();
      reader.onload = async () => {
        const dataUrl = String(reader.result ?? "");
        setTitle((t) => t || stem);
        const apiKey = (typeof localStorage !== "undefined" && localStorage.getItem("openai-key")) || "";
        try {
          const { markdown } = await runImageOcr(dataUrl, apiKey);
          setBody((b) => (b ? b + "\n\n" : "") + markdown);
        } catch {
          setBody((b) => b + `\n\n> ${f.name} OCR 실패 — 텍스트를 직접 입력하세요.`);
        }
      };
      reader.readAsDataURL(f);
    } else if (/\.pdf$/i.test(f.name) || f.type === "application/pdf") {
      void importPdf(f);
    } else {
      setBody((b) => b + `\n\n> ${f.name} — 지원하지 않는 형식이에요 (md/txt/pdf/이미지).`);
    }
  };
  const onFiles = (files: FileList) => Array.from(files).forEach(addFile);

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

  // ── 작성 패널 (공통) ──
  const composePane = (
    <section className="flex min-w-0 flex-1 flex-col overflow-y-auto">
      <PaneHeader label="새 페이지" hint="자료 → 원본(archive) 저장 → (선택) AI 위키·관계 생성" />
      <div className="space-y-3 p-4">
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="제목"
          className="w-full bg-transparent text-[18px] font-bold text-ink outline-none placeholder:text-ink-faint"
        />
        <FileDropzone onFiles={onFiles} accept=".md,.markdown,.txt,.pdf,image/*,application/pdf" className="!p-4" description="md · txt · pdf · 이미지를 드래그하거나 클릭" />
        <SlashBlockEditor
          value={body}
          onChange={setBody}
          onSubmit={run}
          placeholder="'/' 로 블록 삽입 · 마크다운으로 작성 · ⌘Enter 로 저장"
          height="260px"
        />
        <div className="flex items-center justify-between gap-2">
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
      </div>
    </section>
  );

  // ── NOTE 패널 (2-split 좌측) — 저장된 원본 열람 ──
  const notePane = (
    <section className="flex min-w-0 w-[46%] shrink-0 flex-col border-r border-hairline">
      <PaneHeader
        label="NOTE"
        hint={`저장된 원본 ${notes.length}개`}
        right={
          notes.length > 0 ? (
            <div className="flex items-center gap-1.5">
              <PaneSelect
                value={refNote?.path ?? ""}
                onChange={setRefNotePath}
                options={notes.map((n) => ({ value: n.path, label: n.title }))}
              />
              {refNote && (
                <Button size="sm" variant="utility" onClick={() => onOpenNote(refNote)}>
                  탭으로 열기
                </Button>
              )}
            </div>
          ) : undefined
        }
      />
      <div className="min-h-0 flex-1 overflow-y-auto p-4">
        {refNote ? (
          <>
            <h2 className="mb-1 text-[17px] font-bold text-ink">{refNote.title}</h2>
            <p className="mb-3 text-[12px] text-ink-faint">
              {refNote.createdAt.slice(0, 10)} · {refNote.path}
            </p>
            <Markdown source={refNote.markdown} embedSpace={space} />
          </>
        ) : (
          <p className="pt-8 text-center text-[14px] text-ink-muted">
            아직 원본이 없어요.
            <br />
            오른쪽 새 페이지에서 첫 노트를 저장해보세요.
          </p>
        )}
      </div>
    </section>
  );

  // ── PDF 패널 (3-split 좌측) — 원본 자료 열람 + 추출 ──
  const pdfPane = (
    <section className="flex min-w-0 w-1/3 shrink-0 flex-col border-r border-hairline">
      <PaneHeader
        label="PDF"
        hint={sources.length > 0 ? `원본 파일 ${sources.length}개` : "원본 파일 없음"}
        right={
          <div className="flex items-center gap-1.5">
            {sources.length > 0 && (
              <PaneSelect value={refSource} onChange={setRefSource} options={sources.map((s) => ({ value: s, label: s }))} />
            )}
            <label className="cursor-pointer rounded-md border border-hairline px-2 py-1 text-[12px] text-ink-2 transition-colors hover:bg-surface-soft">
              업로드
              <input
                type="file"
                accept=".pdf,application/pdf"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  e.target.value = "";
                  if (f) void importPdf(f);
                }}
              />
            </label>
          </div>
        }
      />
      <div className="min-h-0 flex-1 overflow-y-auto p-4">
        {pdfBusy && <p className="mb-2 text-[13px] text-ink-muted">PDF 처리 중…</p>}
        {refSource ? (
          <FilePreview space={space} target={refSource} />
        ) : (
          <p className="pt-8 text-center text-[14px] text-ink-muted">
            PDF를 업로드하면 여기서 보면서
            <br />
            가운데에 필기할 수 있어요.
          </p>
        )}
      </div>
      {refSource && /\.pdf$/i.test(refSource) && (
        <div className="border-t border-hairline p-2">
          <Button
            size="sm"
            variant="utility"
            className="w-full"
            disabled={pdfBusy}
            onClick={async () => {
              setPdfBusy(true);
              try {
                const ext = await ipc.extractPdfText(space, refSource);
                const text = ext.pages.map((p) => p.text).join("\n\n").trim();
                setBody((b) => (b ? b + "\n\n" : "") + `![[${refSource}]]\n\n${text}`);
              } catch {
                setBody((b) => b + `\n\n> ${refSource} 텍스트 추출 실패`);
              } finally {
                setPdfBusy(false);
              }
            }}
          >
            텍스트 추출 → 에디터
          </Button>
        </div>
      )}
    </section>
  );

  // ── Wiki 패널 (3-split 우측) — 생성된 위키 참조 ──
  const wikiPane = (
    <section className="flex min-w-0 w-[28%] shrink-0 flex-col border-l border-hairline">
      <PaneHeader
        label="WIKI"
        hint={existing.length > 0 ? `위키 ${existing.length}개` : "위키 없음"}
        right={
          existing.length > 0 ? (
            <div className="flex items-center gap-1.5">
              <PaneSelect
                value={refWiki?.path ?? ""}
                onChange={setRefWikiPath}
                options={existing.map((w) => ({ value: w.path, label: w.title }))}
              />
              {refWiki && (
                <Button size="sm" variant="utility" onClick={() => onOpenWiki(refWiki.path)}>
                  열기
                </Button>
              )}
            </div>
          ) : undefined
        }
      />
      <div className="min-h-0 flex-1 overflow-y-auto p-4">
        {refWiki ? (
          <>
            <h2 className="mb-3 text-[17px] font-bold text-ink">{refWiki.title}</h2>
            <Markdown source={refWiki.markdown} embedSpace={space} />
          </>
        ) : (
          <p className="pt-8 text-center text-[14px] text-ink-muted">
            AI 정리를 실행하면
            <br />
            생성된 위키가 여기 나타나요.
          </p>
        )}
      </div>
    </section>
  );

  return (
    <div className="flex h-full min-h-0 flex-col">
      {/* 헤더 — 뷰 전환 */}
      <header className="flex shrink-0 items-center justify-between gap-3 border-b border-hairline px-4 py-2">
        <p className="min-w-0 truncate text-[14px]">
          <span className="font-bold text-ink">Inbox</span>
          <span className="text-ink-muted"> · {spaceName} · 자료 → 원본(archive) 저장 → (선택) AI 위키·관계 생성</span>
        </p>
        <div className="flex shrink-0 items-center rounded-md border border-hairline p-0.5">
          {(["2", "3"] as const).map((v) => (
            <button
              key={v}
              type="button"
              onClick={() => changeView(v)}
              className={cn(
                "rounded px-2.5 py-1 text-[12px] font-medium transition-colors",
                view === v ? "bg-surface-soft text-ink" : "text-ink-muted hover:text-ink",
              )}
            >
              {v === "2" ? "2분할" : "3분할"}
            </button>
          ))}
        </div>
      </header>

      {/* 분할 본문 */}
      <div className="flex min-h-0 flex-1">
        {view === "2" ? (
          <>
            {notePane}
            {composePane}
          </>
        ) : (
          <>
            {pdfPane}
            {composePane}
            {wikiPane}
          </>
        )}
      </div>
    </div>
  );
}

function PaneHeader({ label, hint, right }: { label: string; hint?: string; right?: React.ReactNode }) {
  return (
    <div className="flex h-10 shrink-0 items-center justify-between gap-2 border-b border-hairline px-3">
      <p className="min-w-0 truncate">
        <span className="ds-eyebrow text-ink-faint">{label}</span>
        {hint && <span className="ml-2 text-[12px] text-ink-muted">{hint}</span>}
      </p>
      {right}
    </div>
  );
}

function PaneSelect({ value, onChange, options }: { value: string; onChange: (v: string) => void; options: { value: string; label: string }[] }) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="max-w-[180px] truncate rounded-md border border-hairline bg-surface px-2 py-1 text-[12px] text-ink outline-none"
    >
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  );
}
