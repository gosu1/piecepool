import { useCallback, useEffect, useRef, useState } from "react";
import { Button, FileDropzone, Icons, cn } from "../../ds";
import type { KnowledgeSpace, WikiPage as WikiPageT } from "../../lib/types";
import * as ipc from "../../lib/ipc";
import { useImportStore } from "../../store/importStore";
import type { ImportJobView } from "../../store/importStore";
import { useWorkspaceStore } from "../../store/workspaceStore";
import { PAGE_EMOJI, Popover } from "./PageHeader";
import { runImageOcr } from "../../llm/ocr";
import { runPdfDigest } from "../../llm/pdfdigest";
import { SlashBlockEditor } from "../../lib/SlashBlockEditor";
import { ConfirmDialog } from "../shell/Dialogs";
import { Markdown } from "../../lib/markdown";
import { FilePreview } from "../../lib/FilePreview";
import { PdfViewer } from "../../lib/PdfViewer";
import {
  getInboxPanels,
  setInboxPanel,
  getInboxPaneWidths,
  setInboxPaneWidth,
  clampPanePct,
  INBOX_PANE_DEFAULTS,
  type InboxPanelKey,
  type InboxPaneKey,
} from "../../lib/settings";

// ══ Inbox 섹션 — 캡처 워크스페이스 ══
// Inbox 의 목적 = 수집: 자료를 옆에 두고 필기를 만들어 원본(archive)으로 저장.
// 노트 에디터가 중심(항상 고정), 좌(PDF 자료)·우(위키 참조)는 보조 패널로 여닫는다.
// PDF 업로드 → PDF 패널 자동 열림, AI 정리 완료 → 위키 패널 자동 열림.
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
  spaces,
  wikiBySlug,
  onOpenWiki,
  onRefresh,
}: {
  space: string;
  spaceId: string;
  spaceName: string;
  subjectIdsDefault: string[];
  existing: WikiPageT[];
  // 저장 대상 폴더 선택용 — 전체 지식 공간 목록과 공간별 위키(대상 폴더의 dedup 기준)
  spaces: KnowledgeSpace[];
  wikiBySlug: Record<string, WikiPageT[]>;
  onOpenWiki: (file: string) => void;
  onRefresh: (space: string) => Promise<void> | void;
}) {
  // ── 저장 대상 폴더(지식 공간) — 기본은 현재 공간, 저장 버튼 옆 드롭다운으로 변경 ──
  // 참조 패널(PDF·위키)은 현재 공간 그대로 두고, 저장 목적지만 바꾼다(작성 중 드래프트 유지).
  const [targetSpace, setTargetSpace] = useState(space);
  useEffect(() => setTargetSpace(space), [space]);
  const resolveTarget = (slug: string) => ({
    spaceId: slug === space ? spaceId : (spaces.find((s) => s.slug === slug)?.id ?? spaceId),
    existing: slug === space ? existing : (wikiBySlug[slug] ?? []),
    subjectIds: slug === space ? subjectIdsDefault : (wikiBySlug[slug]?.[0]?.subjectIds ?? []),
  });
  // ── 보조 패널(PDF·위키) 열림 상태 ──
  const [panels, setPanels] = useState(getInboxPanels());
  const togglePanel = (key: InboxPanelKey, open?: boolean) => {
    const next = open ?? !panels[key];
    setInboxPanel(key, next);
    setPanels((p) => ({ ...p, [key]: next }));
  };

  // ── 작성(새 페이지) 상태 ──
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [withLlm, setWithLlm] = useState(true);
  const [clarify, setClarify] = useState(false);
  const [answers, setAnswers] = useState<string[]>([]);
  // 페이지 아이콘(이모지) — 저장 완료 시 생성된 노트의 아이콘(workspaceStore)으로 연결
  const [pageIcon, setPageIcon] = useState("");
  const [iconOpen, setIconOpen] = useState(false);
  const { job, gaps, runImport, respondClarify } = useImportStore();
  const busy = !!job && !["completed", "failed"].includes(job.status);

  // ── 참조 패널 상태 ──
  const [refWikiPath, setRefWikiPath] = useState<string>("");
  const [sources, setSources] = useState<string[]>([]);
  const [refSource, setRefSource] = useState<string>("");
  // 동시 임포트(다중 drop) 대응 — 불리언이면 먼저 끝난 건이 busy 를 풀어버린다.
  const [pdfJobs, setPdfJobs] = useState(0);
  const pdfBusy = pdfJobs > 0;
  const [uploadOpen, setUploadOpen] = useState(false);
  const [confirmDelSrc, setConfirmDelSrc] = useState(false);
  const [srcErr, setSrcErr] = useState<string | null>(null);
  const deleteSource = async () => {
    setConfirmDelSrc(false);
    setSrcErr(null);
    try {
      await ipc.deleteSource(space, refSource);
      await loadSources(); // refSource 는 loadSources 가 목록 기준으로 재보정
    } catch (e) {
      setSrcErr(String(e));
    }
  };

  // ── 패널 폭 드래그 리사이즈 (Sidebar 패턴, % 기반) ──
  // 노트 패널 최소 px 폭 — <section> minWidth 와 드래그 상한 클램프가 공유하는 SSOT
  const NOTE_MIN_PX = 360;
  const splitRef = useRef<HTMLDivElement>(null);
  const [paneW, setPaneW] = useState(getInboxPaneWidths());
  // dir: 1 = 좌측 패널(오른쪽 드래그 → 커짐), -1 = 우측 패널(왼쪽 드래그 → 커짐)
  const startPaneDrag = (key: InboxPaneKey, dir: 1 | -1) => (e: React.PointerEvent) => {
    const total = splitRef.current?.clientWidth;
    if (!total) return;
    e.preventDefault();
    const startX = e.clientX;
    const startPct = paneW[key];
    const prevSelect = document.body.style.userSelect;
    const prevCursor = document.body.style.cursor;
    document.body.style.userSelect = "none";
    document.body.style.cursor = "col-resize";
    // 상한선: 반대편 패널 폭 + 노트 최소폭을 뺀 나머지까지만 — 더 늘리면 노트가 눌리며 전체가 뷰포트 밖으로 넘친다.
    const otherKey: InboxPaneKey = key === "pdf" ? "wiki" : "pdf";
    const otherPct = panels[otherKey] ? paneW[otherKey] : 0;
    const maxPct = 100 - otherPct - (NOTE_MIN_PX / total) * 100;
    const pctAt = (clientX: number) =>
      clampPanePct(Math.min(startPct + ((clientX - startX) / total) * 100 * dir, maxPct));
    const onMove = (ev: PointerEvent) => setPaneW((w) => ({ ...w, [key]: pctAt(ev.clientX) }));
    const onUp = (ev: PointerEvent) => {
      setInboxPaneWidth(key, pctAt(ev.clientX));
      document.body.style.userSelect = prevSelect;
      document.body.style.cursor = prevCursor;
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
  };
  const resetPane = (key: InboxPaneKey) => {
    setPaneW((w) => ({ ...w, [key]: INBOX_PANE_DEFAULTS[key] }));
    setInboxPaneWidth(key, INBOX_PANE_DEFAULTS[key]);
  };

  useEffect(() => {
    if (!uploadOpen) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setUploadOpen(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [uploadOpen]);

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
    if (panels.pdf) void loadSources();
  }, [panels.pdf, loadSources]);

  // PDF → sources/original-files 저장 + 텍스트 추출 → (키 있으면) AI 요약·정리 → 에디터에 삽입.
  // 요약 실패/키 없음이면 추출 원문 그대로 — 원문은 "텍스트 추출 → 에디터" 버튼으로 언제든 다시 가져온다.
  const importPdf = async (f: File) => {
    setPdfJobs((n) => n + 1);
    try {
      const stored = await ipc.saveSourceFile(space, f.name, await fileToBase64(f));
      await loadSources();
      setRefSource(stored);
      // 올린 PDF 를 바로 볼 수 있게 PDF 패널 자동 열림
      togglePanel("pdf", true);
      setTitle((t) => t || f.name.replace(/\.[^.]+$/, ""));
      try {
        const ext = await ipc.extractPdfText(space, stored);
        const text = ext.pages.map((p) => p.text).join("\n\n").trim();
        let content = text;
        if (!text) {
          // 스캔본(전 페이지 빈 텍스트)은 추출이 성공으로 떨어진다 — 안내 필요
          content = "> PDF에서 텍스트를 찾지 못했어요 — 스캔본이면 이미지로 올려 OCR 하세요.";
        } else {
          const apiKey = (typeof localStorage !== "undefined" && localStorage.getItem("openai-key")) || "";
          try {
            const digest = await runPdfDigest(text, apiKey);
            content = digest.markdown;
            if (digest.truncated) content += "\n\n> ⚠️ 원문이 길어 앞 48,000자만 요약됐어요 — 전체 텍스트는 '텍스트 추출 → 에디터' 버튼으로 가져올 수 있어요.";
          } catch {
            // 요약 실패(네트워크 등) → 추출 원문 폴백
          }
        }
        setBody((b) => (b ? b + "\n\n" : "") + `![[${stored}]]\n\n${content}`);
      } catch {
        setBody((b) => (b ? b + "\n\n" : "") + `![[${stored}]]\n\n> PDF 텍스트 추출 실패 — 스캔본이면 이미지로 올려 OCR 하세요.`);
      }
    } catch (e) {
      setBody((b) => b + `\n\n> ${f.name} 저장 실패: ${String(e)}`);
    } finally {
      setPdfJobs((n) => n - 1);
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
      // 이미지 → 원본 보존(수용기준 §5, 키 무관) + OCR(vision) 3-block 마크다운. 키 없으면 오프라인 폴백.
      const reader = new FileReader();
      reader.onload = async () => {
        const dataUrl = String(reader.result ?? "");
        setTitle((t) => t || stem);
        // 원본 이미지를 sources/original-files 에 저장하고 embed 로 연결 — OCR 실패/키 없음이어도 이미지는 남는다.
        let embed = "";
        try {
          const stored = await ipc.saveSourceFile(space, f.name, dataUrl.split(",")[1] ?? "");
          embed = `![[${stored}]]\n\n`;
          void loadSources();
        } catch {
          // 저장 실패해도 OCR 은 계속
        }
        const apiKey = (typeof localStorage !== "undefined" && localStorage.getItem("openai-key")) || "";
        try {
          const { markdown } = await runImageOcr(dataUrl, apiKey);
          setBody((b) => (b ? b + "\n\n" : "") + embed + markdown);
        } catch {
          setBody((b) => b + `\n\n${embed}> ${f.name} OCR 실패 — 텍스트를 직접 입력하세요.`);
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

  // 저장 완료 → 고른 이모지를 생성된 노트의 페이지 아이콘으로 연결
  const applyPageIcon = (res: ImportJobView) => {
    if (pageIcon && res.notePath) useWorkspaceStore.getState().setDocIcon(`archive:${res.space}:${res.notePath}`, pageIcon);
    setPageIcon("");
  };

  const run = async () => {
    // pdfBusy 게이트: digest 완료 전 저장하면 아카이브에 PDF 내용이 빠진 채 저장되고
    // 뒤늦은 digest 가 비워진 에디터에 고아로 삽입된다.
    if (!title.trim() || busy || pdfBusy) return;
    setAnswers([]);
    const t = resolveTarget(targetSpace);
    const res = await runImport({ space: targetSpace, spaceId: t.spaceId, title: title.trim(), markdown: body, subjectIds: t.subjectIds, withLlm, clarify, existing: t.existing });
    if (res.status === "completed") {
      applyPageIcon(res);
      setTitle("");
      setBody("");
      await onRefresh(targetSpace);
      // 생성된 위키를 바로 확인할 수 있게 위키 패널 자동 열림 (대상=현재 공간일 때만 — 참조 패널은 현재 공간 기준)
      if (withLlm && targetSpace === space) togglePanel("wiki", true);
    }
  };

  const finishClarify = async (ans: string[] | null) => {
    const res = await respondClarify(ans);
    if (res.status === "completed") {
      applyPageIcon(res);
      setTitle("");
      setBody("");
      setAnswers([]);
      await onRefresh(targetSpace);
      if (targetSpace === space) togglePanel("wiki", true);
    }
  };

  const steps = withLlm
    ? clarify
      ? ["archiving", "llm_processing", "clarify_pending", "writing", "completed"]
      : ["archiving", "llm_processing", "writing", "completed"]
    : ["archiving", "writing", "completed"];
  const curIdx = job ? steps.indexOf(job.status) : -1;

  // ── 노트 패널 (중심 고정) — 새 원본(archive) 작성 ──
  const notePane = (
    <section style={{ minWidth: NOTE_MIN_PX }} className="flex min-w-0 flex-1 flex-col">
      <PaneHeader label="노트" hint="자료 → 원본(archive) 저장 → (선택) AI 위키·관계 생성" />
      <div className="flex min-h-0 flex-1 flex-col overflow-y-auto p-4">
        {/* Notion풍 새 페이지 헤더 — 아이콘 · 큰 제목 · 속성 행 · 구분선 (문서 뷰 PageHeader 와 같은 시각 언어) */}
        <div className="relative inline-block shrink-0 self-start">
          <button
            type="button"
            aria-label="페이지 아이콘"
            onClick={() => setIconOpen((o) => !o)}
            className="flex h-12 w-12 items-center justify-center rounded-lg text-[32px] leading-none transition-colors hover:bg-surface-soft"
          >
            {pageIcon || <span className="h-8 w-8 rounded-md bg-surface-soft ring-1 ring-hairline" />}
          </button>
          {iconOpen && (
            <Popover onClose={() => setIconOpen(false)} className="w-64 p-2">
              <div className="grid grid-cols-8 gap-0.5">
                {PAGE_EMOJI.map((e) => (
                  <button
                    key={e}
                    type="button"
                    onClick={() => {
                      setPageIcon(e);
                      setIconOpen(false);
                    }}
                    className="rounded p-1 text-[18px] hover:bg-surface-soft"
                  >
                    {e}
                  </button>
                ))}
              </div>
              {pageIcon && (
                <button
                  type="button"
                  onClick={() => {
                    setPageIcon("");
                    setIconOpen(false);
                  }}
                  className="mt-1 flex w-full items-center rounded-md px-2 py-1 text-left text-[13px] text-ink-muted hover:bg-surface-soft"
                >
                  아이콘 제거
                </button>
              )}
            </Popover>
          )}
        </div>
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="새 페이지"
          className="mt-1 w-full shrink-0 bg-transparent text-[32px] font-bold leading-tight text-ink outline-none placeholder:text-ink-faint"
        />
        <div className="mt-3 shrink-0 space-y-px text-[14px]">
          {spaces.length > 1 && (
            <div className="flex min-h-[30px] items-center">
              <span className="flex w-40 shrink-0 items-center gap-2 px-2 text-[14px] text-ink-muted">
                <span className="text-ink-faint">
                  <Icons.FolderIcon size={15} />
                </span>
                저장 위치
              </span>
              <select
                value={targetSpace}
                onChange={(e) => setTargetSpace(e.target.value)}
                className="max-w-[200px] truncate rounded-md bg-transparent px-2 py-1 text-[14px] text-ink outline-none transition-colors hover:bg-surface-soft"
              >
                {spaces.map((s) => (
                  <option key={s.slug} value={s.slug}>
                    {s.name}
                  </option>
                ))}
              </select>
            </div>
          )}
          <div className="flex min-h-[30px] items-center">
            <span className="flex w-40 shrink-0 items-center gap-2 px-2 text-[14px] text-ink-muted">
              <span className="text-ink-faint">
                <Icons.SparkleIcon size={15} />
              </span>
              AI 위키·관계 생성
            </span>
            <div className="flex-1 px-2">
              <input
                type="checkbox"
                checked={withLlm}
                onChange={(e) => setWithLlm(e.target.checked)}
                aria-label="AI 위키·관계까지 생성"
                className="h-[15px] w-[15px] accent-primary"
              />
            </div>
          </div>
          <div className="flex min-h-[30px] items-center">
            <span className={cn("flex w-40 shrink-0 items-center gap-2 px-2 text-[14px]", withLlm ? "text-ink-muted" : "text-ink-faint")}>
              <span className="text-ink-faint">
                <Icons.HelpCircleIcon size={15} />
              </span>
              되묻기(clarify)
            </span>
            <div className="flex flex-1 items-center gap-2 px-2">
              <input
                type="checkbox"
                checked={clarify}
                onChange={(e) => setClarify(e.target.checked)}
                disabled={!withLlm}
                aria-label="되묻기 — 저장 전 이해 확인"
                className="h-[15px] w-[15px] accent-primary"
              />
              <span className="text-[13px] text-ink-faint">저장 전 이해 확인</span>
            </div>
          </div>
        </div>
        <div className="mt-3 shrink-0 border-t border-hairline" />
        <div className="min-h-[160px] flex-1 pt-3">
          <SlashBlockEditor
            value={body}
            onChange={setBody}
            onSubmit={run}
            placeholder="'/' 로 블록 삽입 · 마크다운으로 작성 · ⌘Enter 로 저장"
            height="100%"
            className="h-full"
          />
        </div>
        <div className="flex shrink-0 items-center justify-end pt-3">
          <Button variant="solid" onClick={run} disabled={busy || pdfBusy || !title.trim()}>
            {busy ? `${IMPORT_STATUS_LABEL[job!.status]}…` : pdfBusy ? "PDF 처리 중…" : withLlm ? "저장 + AI 정리" : "원본으로 저장"}
          </Button>
        </div>

        {job?.status === "clarify_pending" && (
          <div className="mt-3 shrink-0 space-y-3 rounded-md border border-primary/40 bg-primary/[0.04] p-3">
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
          <div className="mt-3 shrink-0 rounded-md border border-hairline bg-surface-soft p-3 text-[13px]">
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
                    {job.factChecked ? ` · 출처검증 ${job.factChecked}건` : ""}
                  </span>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </section>
  );

  // PDF 원문 텍스트를 에디터로 가져오기 — PdfViewer 툴바 버튼에서 호출
  const extractToEditor = async () => {
    setPdfJobs((n) => n + 1);
    try {
      const ext = await ipc.extractPdfText(space, refSource);
      const text = ext.pages.map((p) => p.text).join("\n\n").trim();
      setBody((b) => (b ? b + "\n\n" : "") + `![[${refSource}]]\n\n${text}`);
    } catch {
      setBody((b) => b + `\n\n> ${refSource} 텍스트 추출 실패`);
    } finally {
      setPdfJobs((n) => n - 1);
    }
  };

  // ── PDF 패널 (3-split 좌측) — 원본 자료 열람 + 추출 ──
  const refSourceIsPdf = /\.pdf$/i.test(refSource);
  const pdfPane = (
    <section style={{ width: `${paneW.pdf}%`, minWidth: 280 }} className="flex min-w-0 shrink-0 flex-col border-r border-hairline">
      <PaneHeader
        label="PDF"
        hint={sources.length > 0 ? `원본 파일 ${sources.length}개` : "원본 파일 없음"}
        right={
          <div className="flex min-w-0 items-center gap-1.5">
            {sources.length > 0 && (
              <PaneSelect value={refSource} onChange={setRefSource} options={sources.map((s) => ({ value: s, label: s }))} />
            )}
            {refSource && (
              <Button size="sm" variant="utility" className="shrink-0 whitespace-nowrap" onClick={() => setConfirmDelSrc(true)}>
                삭제
              </Button>
            )}
            <Button size="sm" variant="utility" className="shrink-0 whitespace-nowrap" onClick={() => setUploadOpen(true)}>
              업로드
            </Button>
          </div>
        }
      />
      {srcErr && <p className="shrink-0 border-b border-hairline px-4 py-1.5 text-[13px] text-danger">원본 삭제 실패: {srcErr}</p>}
      {refSource && refSourceIsPdf ? (
        <div className="flex min-h-0 flex-1 flex-col">
          {pdfBusy && <p className="shrink-0 border-b border-hairline px-4 py-1.5 text-[13px] text-ink-muted">PDF 처리 중…</p>}
          <PdfViewer space={space} file={refSource} onExtractText={extractToEditor} extractBusy={pdfBusy} />
        </div>
      ) : (
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
      )}
    </section>
  );

  // ── 위키 패널 (우측 보조) — 생성된 위키 참조 ──
  const wikiPane = (
    <section style={{ width: `${paneW.wiki}%`, minWidth: 280 }} className="flex min-w-0 shrink-0 flex-col border-l border-hairline">
      <PaneHeader
        label="위키"
        hint={existing.length > 0 ? `위키 ${existing.length}개` : "위키 없음"}
        right={
          existing.length > 0 ? (
            <div className="flex min-w-0 items-center gap-1.5">
              <PaneSelect
                value={refWiki?.path ?? ""}
                onChange={setRefWikiPath}
                options={existing.map((w) => ({ value: w.path, label: w.title }))}
              />
              {refWiki && (
                <Button size="sm" variant="utility" className="shrink-0 whitespace-nowrap" onClick={() => onOpenWiki(refWiki.path)}>
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
      {/* 헤더 — 보조 패널(PDF·위키) 토글. 노트는 항상 중심 고정 */}
      <header className="flex shrink-0 items-center justify-between gap-3 border-b border-hairline px-4 py-2">
        <p className="min-w-0 truncate text-[14px]">
          <span className="font-bold text-ink">Inbox</span>
          <span className="text-ink-muted"> · {spaceName} · 자료 → 원본(archive) 저장 → (선택) AI 위키·관계 생성</span>
        </p>
        <div className="flex shrink-0 items-center gap-0.5 rounded-md border border-hairline p-0.5">
          {(["pdf", "wiki"] as const).map((k) => (
            <button
              key={k}
              type="button"
              aria-pressed={panels[k]}
              onClick={() => togglePanel(k)}
              className={cn(
                "rounded px-2.5 py-1 text-[12px] font-medium transition-colors",
                panels[k] ? "bg-surface-soft text-ink" : "text-ink-muted hover:text-ink",
              )}
            >
              {k === "pdf" ? "PDF 패널" : "위키 패널"}
            </button>
          ))}
        </div>
      </header>

      {/* 본문 — [PDF] | 노트(고정) | [위키]. 디바이더로 폭 조절(더블클릭 = 초기화) */}
      <div ref={splitRef} className="flex min-h-0 flex-1 overflow-hidden">
        {panels.pdf && (
          <>
            {pdfPane}
            <PaneDivider onPointerDown={startPaneDrag("pdf", 1)} onDoubleClick={() => resetPane("pdf")} />
          </>
        )}
        {notePane}
        {panels.wiki && (
          <>
            <PaneDivider onPointerDown={startPaneDrag("wiki", -1)} onDoubleClick={() => resetPane("wiki")} />
            {wikiPane}
          </>
        )}
      </div>

      {/* 원본 파일 삭제 확인 */}
      {confirmDelSrc && (
        <ConfirmDialog
          title={`"${refSource}" 삭제`}
          message="원본 파일이 삭제됩니다. 노트에 남은 ![[임베드]]는 깨진 링크로 표시돼요. 되돌릴 수 없어요."
          confirmLabel="삭제"
          danger
          onConfirm={deleteSource}
          onCancel={() => setConfirmDelSrc(false)}
        />
      )}

      {/* 업로드 팝업 — 새 노트/PDF 패널 헤더 버튼으로 열림 */}
      {uploadOpen && (
        <div className="fixed inset-0 z-40 flex items-start justify-center bg-surface/60 backdrop-blur-md pt-[12vh]" onClick={() => setUploadOpen(false)}>
          <div className="w-full max-w-md rounded-xl border border-hairline bg-surface p-4 shadow-elevated" onClick={(e) => e.stopPropagation()}>
            <FileDropzone
              onFiles={(files) => {
                onFiles(files);
                setUploadOpen(false);
              }}
              accept=".md,.markdown,.txt,.pdf,image/*,application/pdf"
              description="md · txt · pdf · 이미지를 드래그하거나 클릭"
            />
          </div>
        </div>
      )}
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

// 패널 사이 세로 디바이더 — 이웃 패널의 border 위에 겹쳐(-mx) 드래그 히트 영역만 넓힌다.
function PaneDivider({ onPointerDown, onDoubleClick }: { onPointerDown: (e: React.PointerEvent) => void; onDoubleClick: () => void }) {
  return (
    <div
      role="separator"
      aria-orientation="vertical"
      aria-label="패널 폭 조절"
      onPointerDown={onPointerDown}
      onDoubleClick={onDoubleClick}
      className="z-10 -mx-[3px] w-[6px] shrink-0 cursor-col-resize transition-colors hover:bg-primary/30 active:bg-primary/40"
    />
  );
}

function PaneSelect({ value, onChange, options }: { value: string; onChange: (v: string) => void; options: { value: string; label: string }[] }) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="min-w-0 max-w-[180px] truncate rounded-md border border-hairline bg-surface px-2 py-1 text-[12px] text-ink outline-none"
    >
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  );
}
