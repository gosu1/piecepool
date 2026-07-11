import { useCallback, useEffect, useRef, useState } from "react";
import { Button, FileDropzone, Icons, cn } from "../../ds";
import type { KnowledgeSpace, WikiPage as WikiPageT } from "../../lib/types";
import * as ipc from "../../lib/ipc";
import { useImportStore } from "../../store/importStore";
import { useInboxDraftStore, EMPTY_DRAFT, type InboxDraft, type PdfSummaryJob } from "../../store/inboxDraftStore";
import { runImageOcr } from "../../llm/ocr";
import { SlashBlockEditor } from "../../lib/SlashBlockEditor";
import { ConfirmDialog } from "../shell/Dialogs";
import { Markdown } from "../../lib/markdown";
import { FilePreview } from "../../lib/FilePreview";
import { PdfViewer } from "../../lib/PdfViewer";
import {
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
//
// 보조 패널은 "이 노트에 딸린 것"이다. 열림 상태는 저장하지 않고(노트마다 닫힌 채 시작),
// 아무것도 자동 선택하지 않는다 — 빈 노트에 공간의 아무 PDF·아무 위키가 뜨면 안 된다.
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
  subjectIdsDefault,
  existing,
  spaces,
  wikiBySlug,
  onCreateSpace,
  onOpenWiki,
  onRefresh,
  onNotice,
  onDirtyChange,
  onTitleChange,
  draftKey,
  quickMemoOpen,
  onToggleQuickMemo,
}: {
  space: string;
  spaceId: string;
  subjectIdsDefault: string[];
  existing: WikiPageT[];
  // 초안 보존 key = 이 노트 탭의 고유 id — 탭 전환 unmount 돼도 이 key 로 스토어에서 복원. "새 노트"면 새 탭이라 새 key.
  draftKey: string;
  // 저장 대상 폴더 선택용 — 전체 지식 공간 목록과 공간별 위키(대상 폴더의 dedup 기준)
  spaces: KnowledgeSpace[];
  wikiBySlug: Record<string, WikiPageT[]>;
  // 저장 위치 드롭다운에서 바로 새 과목 폴더 만들기 — 만든 slug 를 돌려주면 그 과목으로 대상이 옮겨간다.
  onCreateSpace: (name: string) => Promise<string | null>;
  onOpenWiki: (space: string, file: string) => void;
  onRefresh: (space: string) => Promise<void> | void;
  // 저장 실패 등 사용자 알림(상태바 토스트). 성공은 노트 초기화·위키 패널로 암시.
  onNotice?: (msg: string) => void;
  // 작성 중 초안 유무를 탭에 알린다 — 탭 닫기 확인 판정용
  onDirtyChange?: (dirty: boolean) => void;
  // 노트 제목을 탭 라벨로 반영
  onTitleChange?: (title: string) => void;
  // 퀵메모 — 창 자체는 앱 셸이 소유한다(탭을 바꿔도 살아있어야 하므로). 알약은 그 상태를 비출 뿐이다.
  quickMemoOpen: boolean;
  onToggleQuickMemo: () => void;
}) {
  // ── 저장 대상 폴더(지식 공간) — 기본은 현재 공간, 노트 헤더 드롭다운으로 변경 ──
  // 위키 참조 패널은 저장 대상 공간을 따라간다(그 공간 위키를 보며 쓰게). PDF 패널은 원본 파일이
  // 실제로 현재 공간의 sources/ 에 있으므로 따라가지 않는다.
  const [targetSpace, setTargetSpace] = useState(space);
  useEffect(() => setTargetSpace(space), [space]);
  const resolveTarget = (slug: string) => ({
    spaceId: slug === space ? spaceId : (spaces.find((s) => s.slug === slug)?.id ?? spaceId),
    existing: slug === space ? existing : (wikiBySlug[slug] ?? []),
    subjectIds: slug === space ? subjectIdsDefault : (wikiBySlug[slug]?.[0]?.subjectIds ?? []),
  });
  // ── 작성 상태 — 스토어 소유(탭 전환 언마운트에도 초안·PDF요약 스트림 생존). key = 이 노트 탭 id(draftKey) ──
  // 노트 = 탭 하나. 제목·본문·바인딩·패널·PDF·위키선택을 전부 draftKey 로 보존한다.
  const ds = useInboxDraftStore;
  // EMPTY_DRAFT 병합 — 없거나 옛 스키마(누락 필드) draft 여도 8필드가 항상 채워져 렌더가 안 깨진다.
  const noteDraft = { ...EMPTY_DRAFT, ...useInboxDraftStore((s) => s.drafts[draftKey]) };
  const summaryJob = useInboxDraftStore((s) => s.job);
  const { title, body, savedFile, savedSpace, savedSnapshot, panels, refWikiPath, refSource } = noteDraft;
  const write = (patch: Partial<InboxDraft>) => ds.getState().write(draftKey, patch);
  const setTitle = (v: string) => ds.getState().setTitle(draftKey, v);
  const setBody = (v: string) => ds.getState().setBody(draftKey, v);
  const appendBody = (v: string) => ds.getState().appendBody(draftKey, v);
  const setTitleIfEmpty = (v: string) => {
    if (!ds.getState().drafts[draftKey]?.title) setTitle(v);
  };
  const setRefWikiPath = (v: string) => write({ refWikiPath: v });
  const setRefSource = (v: string) => write({ refSource: v });
  const togglePanel = (key: InboxPanelKey, open?: boolean) => write({ panels: { ...panels, [key]: open ?? !panels[key] } });
  // 이 노트 탭에서 요약 스트리밍 중이면 편집 잠금 + body 뒤에 미확정 텍스트를 파생 렌더.
  const summarizing = summaryJob?.noteKey === draftKey && summaryJob.status === "streaming";
  const editorValue = summarizing && summaryJob.text ? (body ? `${body}\n\n${summaryJob.text}` : summaryJob.text) : body;
  // 요약 완료 시 [!easy] 콜아웃 일괄 접기 트리거(done 이면 non-zero 로 바뀌어 1회 발화).
  const foldEasyKey = summaryJob?.noteKey === draftKey && summaryJob.status === "done" ? summaryJob.text.length : 0;
  const [withLlm, setWithLlm] = useState(true);
  const [clarify, setClarify] = useState(false);
  const [draft, setDraft] = useState(""); // 지금 쓰고 있는 설명(파인만 되묻기)
  const { job, feynman, runImport, explain, retryProbe, switchConcept, finishFeynman } = useImportStore();
  const busy = !!job && !["completed", "failed"].includes(job.status);

  // ── 참조 패널 상태 (sources 목록은 로컬; 선택 refSource·refWikiPath 는 draft 로 보존) ──
  const [sources, setSources] = useState<string[]>([]); // 이 공간의 원본 파일 전체
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

  // 참조 후보 = 저장 대상 공간의 위키. 대상이 바뀌면 이전 공간에서 고른 참조는 버린다(파일명이 공간 간 충돌한다).
  const refCandidates = resolveTarget(targetSpace).existing;
  const targetName = spaces.find((s) => s.slug === targetSpace)?.name ?? targetSpace;
  useEffect(() => setRefWikiPath(""), [targetSpace]);
  // 고른 게 없으면 없는 것 — `?? existing[0]` 폴백은 빈 노트에 공간의 첫 위키(제목 정렬 1등)를 띄웠다.
  const refWiki = refCandidates.find((w) => w.path === refWikiPath) ?? null;

  const loadSources = useCallback(async () => {
    try {
      const list = await ipc.listSources(space);
      setSources(list);
      // 목록의 첫 파일을 자동 선택하지 않는다 — 이 노트와 무관한 원본이 열린다.
      const cur = ds.getState().drafts[draftKey]?.refSource ?? "";
      setRefSource(cur && list.includes(cur) ? cur : "");
    } catch {
      setSources([]);
    }
  }, [space, draftKey, ds]);

  useEffect(() => {
    if (panels.pdf) void loadSources();
  }, [panels.pdf, loadSources]);

  // PDF → sources/original-files 저장 + 패널 열람 + 출처 임베드 + 한국어 번역·요약 스트리밍.
  // 요약은 스토어가 소유(fire-and-forget) — 탭을 떠나도 계속 흐르고 종결 시 본문에 병합된다.
  const importPdf = async (f: File) => {
    setPdfJobs((n) => n + 1);
    try {
      const stored = await ipc.saveSourceFile(space, f.name, await fileToBase64(f));
      await loadSources();
      setRefSource(stored);
      // 올린 PDF 를 바로 볼 수 있게 PDF 패널 자동 열림
      togglePanel("pdf", true);
      setTitleIfEmpty(f.name.replace(/\.[^.]+$/, ""));
      // 출처 연결용 임베드만 삽입(현재 출처 연결이 본문 ![[...]] 파싱에 의존 — 2단계에서 메타데이터로 이관 예정)
      appendBody(`![[${stored}]]`);
      // PDF 내용 → 한국어 요약 스트리밍. 추출/키없음/타 요약 진행 중이면 embed 만 남기고 안내.
      try {
        const ext = await ipc.extractPdfText(space, stored);
        const text = ext.pages.map((p) => p.text).join("\n\n").trim();
        if (!text) return;
        const apiKey = (typeof localStorage !== "undefined" && localStorage.getItem("gemini-key")) || "";
        if (!apiKey) {
          onNotice?.("AI 요약 키가 없어요 — 설정에서 Gemini 키를 넣으면 PDF를 한국어로 요약해요");
          return;
        }
        if (ds.getState().job?.status === "streaming") {
          onNotice?.("다른 PDF 요약이 진행 중이에요 — 끝난 뒤 다시 올려주세요");
          return;
        }
        const noteTitle = ds.getState().drafts[draftKey]?.title || f.name.replace(/\.[^.]+$/, "");
        void ds.getState().runSummary({ noteKey: draftKey, file: stored, title: noteTitle, text });
      } catch {
        // 추출 실패 — 사용자가 직접 필기하면 됨(embed 는 이미 들어감)
      }
    } catch (e) {
      onNotice?.(`${f.name} 저장 실패: ${String(e)}`);
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
        appendBody(text);
        setTitleIfEmpty(stem);
      };
      reader.readAsText(f);
    } else if (f.type.startsWith("image")) {
      // 이미지 → 원본 보존(수용기준 §5, 키 무관) + OCR(vision) 3-block 마크다운. 키 없으면 오프라인 폴백.
      const reader = new FileReader();
      reader.onload = async () => {
        const dataUrl = String(reader.result ?? "");
        setTitleIfEmpty(stem);
        // 원본 이미지를 sources/original-files 에 저장하고 embed 로 연결 — OCR 실패/키 없음이어도 이미지는 남는다.
        let embed = "";
        try {
          const stored = await ipc.saveSourceFile(space, f.name, dataUrl.split(",")[1] ?? "");
          embed = `![[${stored}]]\n\n`;
              void loadSources();
        } catch {
          // 저장 실패해도 OCR 은 계속
        }
        const apiKey = (typeof localStorage !== "undefined" && localStorage.getItem("gemini-key")) || "";
        try {
          const { markdown } = await runImageOcr(dataUrl, apiKey);
          appendBody(embed + markdown);
        } catch {
          appendBody(`${embed}> ${f.name} OCR 실패 — 텍스트를 직접 입력하세요.`);
        }
      };
      reader.readAsDataURL(f);
    } else if (/\.pdf$/i.test(f.name) || f.type === "application/pdf") {
      void importPdf(f);
    } else {
      appendBody(`> ${f.name} — 지원하지 않는 형식이에요 (md/txt/pdf/이미지).`);
    }
  };
  const onFiles = (files: FileList) => Array.from(files).forEach(addFile);

  const run = async () => {
    // pdfBusy/summarizing 게이트: 요약 완료 전 저장하면 아카이브에 PDF 요약이 빠진 채 저장되고
    // 뒤늦은 요약이 비워진 에디터에 고아로 삽입된다.
    if (!title.trim() || busy || pdfBusy || summarizing) return;
    setDraft("");
    const t = resolveTarget(targetSpace);
    // 재저장(saveNote)은 savedFile 이 그 공간에 있을 때만 — 대상 공간을 바꿨으면 새 노트로(다른 공간 노트 덮어쓰기 방지).
    const reuse = savedFile && savedSpace === targetSpace ? savedFile : undefined;
    const res = await runImport({ space: targetSpace, spaceId: t.spaceId, title: title.trim(), markdown: body, subjectIds: t.subjectIds, withLlm, clarify, existing: t.existing, noteFile: reuse });
    // 생성/갱신된 노트에 바인딩(살아있는 노트) — 노트를 비우지 않고 이어서 필기.
    if (res.noteFile) write({ savedFile: res.noteFile, savedSpace: targetSpace });
    if (res.status === "completed") {
      write({ savedSnapshot: `${title.trim()} ${body}` });
      await onRefresh(targetSpace);
      if (res.clarifySkipped) onNotice?.("AI 정리 키가 없어 되묻기를 건너뛰었어요 — 설정에서 키를 넣어주세요");
      else onNotice?.(withLlm ? "위키에 반영됐어요 ✓ — 이어서 필기하세요" : "저장됐어요 ✓ — 이어서 필기하세요");
      // 방금 만든 위키가 있을 때만 위키 패널을 연다 (참조 패널은 저장 대상 공간을 따르므로 다른 공간에 저장해도 뜬다)
      if (withLlm && res.firstWikiPath) {
        setRefWikiPath(res.firstWikiPath);
        togglePanel("wiki", true);
      }
    } else if (res.status === "failed") {
      onNotice?.(`저장 실패: ${res.errorMessage ?? "알 수 없는 오류"}`);
    }
  };

  // 설명 제출 → LLM 이 구멍 하나를 짚어 되묻는다. 디스크는 안 바뀐다.
  const submitExplanation = async () => {
    const said = draft.trim();
    if (!said || feynman.probing) return;
    setDraft("");
    await explain(said);
  };

  // [그만] — 이해 여부는 사용자가 선언한다. LLM 이 채점하지 않는다.
  const finishClarify = async (understood: boolean) => {
    const res = await finishFeynman(understood);
    if (res.status === "completed") {
      setDraft("");
      // 노트를 비우지 않는다 — 이어서 필기. 방금 저장된 노트·공간에 바인딩.
      if (res.noteFile) write({ savedFile: res.noteFile, savedSpace: targetSpace });
      write({ savedSnapshot: `${title.trim()} ${body}` });
      await onRefresh(targetSpace);
      if (res.reviewMarked) onNotice?.(`"${res.reviewMarked}" 을(를) 복습 필요로 표시했어요`);
      else if (res.reviewNoEvidence) onNotice?.("설명을 한 번도 쓰지 않아 복습 표시를 하지 않았어요");
      else if (res.reviewMissed) onNotice?.("복습 표시를 못 했어요 — 정리 결과에 그 개념이 없습니다");
      else onNotice?.("위키에 반영됐어요 ✓ — 이어서 필기하세요");
      if (res.regenDowngraded) onNotice?.("AI 재생성에 실패해 첫 정리 결과를 그대로 저장했어요");
      if (res.firstWikiPath) {
        setRefWikiPath(res.firstWikiPath);
        togglePanel("wiki", true);
      }
    } else if (res.status === "failed") {
      onNotice?.(`저장 실패: ${res.errorMessage ?? "알 수 없는 오류"}`);
    }
  };


  // 작성 중 초안 여부를 탭에 알린다 — 저장 직후엔 내용이 남아도 "깨끗"(마지막 저장과 동일). 바뀌면 다시 dirty.
  // 콜백은 매 렌더 새 함수라 deps 에 넣으면 setTabDirty → 리렌더 → 다시 호출로 돈다. ref 로 고정.
  const dirty = !!(title.trim() || body.trim()) && `${title.trim()} ${body}` !== savedSnapshot;
  const onDirtyChangeRef = useRef(onDirtyChange);
  onDirtyChangeRef.current = onDirtyChange;
  useEffect(() => onDirtyChangeRef.current?.(dirty), [dirty]);
  // 제목을 탭 라벨로 알린다 — 여러 노트 탭을 제목으로 구분한다.
  const onTitleChangeRef = useRef(onTitleChange);
  onTitleChangeRef.current = onTitleChange;
  useEffect(() => onTitleChangeRef.current?.(title), [title]);

  // ── 노트 패널 (중심 고정) — 새 원본(archive) 작성 ──
  // PDF·위키 보조 패널 토글 — 노트 헤더 우측 슬롯에 배치(독립 헤더 줄 제거 → 3줄→2줄)
  // note variant 는 토글이 없다: 패널은 PDF 업로드·AI 정리로만 등장하고, 각 패널 헤더의 ×로 닫는다.
  const panelToggles = (
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
  );

  const notePane = (
    <section style={{ minWidth: NOTE_MIN_PX }} className="flex min-w-0 flex-1 flex-col">
      <PaneHeader right={panelToggles} />
      <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">
        {/* 수집 캔버스 헤더 밴드 — 제목 · 한 줄 안내 · 속성 pill. 구분선으로만 몸통과 분리(틴트 없음) */}
        <div className="shrink-0 border-b border-hairline px-5 pb-4 pt-5">
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="새 페이지"
            className="w-full bg-transparent text-[30px] font-bold leading-tight text-ink outline-none placeholder:text-ink-faint"
          />
          <p className="mt-1.5 text-[13px] text-ink-muted">생각의 파편을 담아보세요 — 저장하면 AI가 위키로 정리해요.</p>
          <div className="mt-3 flex flex-wrap items-center gap-1.5">
            <SpacePicker
              spaces={spaces}
              value={targetSpace}
              onChange={setTargetSpace}
              onCreate={async (name) => {
                const slug = await onCreateSpace(name);
                if (slug) setTargetSpace(slug);
              }}
            />
            <PropertyPill active={withLlm} onClick={() => setWithLlm(!withLlm)} icon={<Icons.SparkleIcon size={13} />}>
              AI 생성
              {withLlm && <Icons.CheckIcon size={12} className="ml-0.5" />}
            </PropertyPill>
            <PropertyPill active={clarify} disabled={!withLlm} onClick={() => setClarify(!clarify)} icon={<Icons.HelpCircleIcon size={13} />}>
              되묻기
            </PropertyPill>
            {/* 퀵메모 — 창 열림/닫힘을 그대로 반영하는 토글. AI 생성 여부와 무관하게 항상 쓸 수 있다. */}
            <PropertyPill active={quickMemoOpen} onClick={onToggleQuickMemo} icon={<Icons.EditIcon size={13} />}>
              퀵메모
            </PropertyPill>
          </div>
        </div>
        {/* 캔버스 — 에디터 + 주액션 (수집의 본체) */}
        <div className="flex min-h-0 flex-1 flex-col p-4">
          <div className="min-h-[160px] flex-1 pt-1">
          <SlashBlockEditor
            value={editorValue}
            onChange={setBody}
            onSubmit={run}
            readOnly={summarizing}
            foldEasyKey={foldEasyKey}
            placeholder="'/' 로 블록 삽입 · 마크다운으로 작성 · ⌘Enter 로 저장"
            height="100%"
            className="h-full"
            frameless
          />
        </div>
        {summaryJob?.noteKey === draftKey && <SummaryStrip job={summaryJob} onCancel={() => ds.getState().cancelSummary()} onClose={() => ds.getState().clearJob()} />}
        <div className="flex shrink-0 items-center justify-between pt-3">
          <span className="text-[12px] text-ink-faint">⌘Enter 로 저장</span>
          <Button
            variant="primary"
            onClick={run}
            disabled={busy || pdfBusy || summarizing || !title.trim()}
            leftIcon={<Icons.SparkleIcon size={16} />}
          >
            {busy ? `${IMPORT_STATUS_LABEL[job!.status]}…` : pdfBusy ? "PDF 처리 중…" : summarizing ? "AI 요약 중…" : withLlm ? "저장 + AI 정리" : "원본으로 저장"}
          </Button>
        </div>

        {job?.status === "clarify_pending" && feynman.concept && job.noteFile === savedFile && (
          <div className="mt-3 shrink-0 space-y-3 rounded-md border border-primary/40 bg-primary/[0.04] p-3">
            {/* 파인만: 고르게 하지 않는다. 자기 말로 설명하게 한다. */}
            <div className="flex items-baseline justify-between gap-2">
              <p className="text-[14px] font-semibold text-ink">
                <span className="text-primary">{feynman.concept}</span> — 처음 배우는 사람에게 설명해보세요
              </p>
              {feynman.candidates.length > 1 && (
                <select
                  value={feynman.concept}
                  onChange={(e) => switchConcept(e.target.value)}
                  disabled={feynman.probing}
                  aria-label="다른 개념으로"
                  className="rounded border border-hairline bg-surface px-1.5 py-0.5 text-[12px] text-ink-2 outline-none disabled:opacity-50"
                >
                  {feynman.candidates.map((c) => (
                    <option key={c} value={c}>{c}</option>
                  ))}
                </select>
              )}
            </div>

            {feynman.history.length > 0 && (
              <div className="max-h-44 space-y-1.5 overflow-y-auto">
                {feynman.history.map((t, i) => (
                  <p
                    key={i}
                    className={cn(
                      "text-[13px] leading-relaxed",
                      t.role === "user" ? "text-ink-2" : "font-medium text-ink",
                    )}
                  >
                    {t.role === "user" ? "나: " : "↳ "}
                    {t.text}
                  </p>
                ))}
              </div>
            )}

            {feynman.probing && <p className="text-[13px] text-ink-faint">읽는 중…</p>}
            {feynman.error && (
              // 설명은 history 에 남아 있다 — 다시 타이핑하지 않고 그대로 재시도한다.
              <div className="flex items-center gap-2">
                <p className="text-[12px] text-danger">되묻기에 실패했어요. 설명은 그대로 있어요.</p>
                <Button size="sm" variant="utility" onClick={retryProbe}>
                  다시 시도
                </Button>
              </div>
            )}

            <textarea
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) void submitExplanation();
              }}
              disabled={feynman.probing}
              rows={3}
              placeholder={feynman.history.length ? "이어서 설명해보세요… (⌘Enter 로 보내기)" : "예: 여러 스레드가 동시에 들어가면 안 되는 코드 부분이요 (⌘Enter 로 보내기)"}
              aria-label="개념 설명"
              className="w-full resize-none rounded border border-hairline bg-surface px-2 py-1.5 text-[13px] text-ink outline-none focus-visible:shadow-soft disabled:opacity-60"
            />

            <div className="flex items-center justify-between gap-2">
              <Button size="sm" variant="solid" disabled={!draft.trim() || feynman.probing} onClick={submitExplanation}>
                {feynman.history.length ? "다시 설명" : "설명 보내기"}
              </Button>
              {/* 이해 판정은 오직 사용자. LLM 은 채점하지 않는다(relation-types.md §review_needed). */}
              <div className="flex gap-2">
                <Button size="sm" variant="utility" disabled={feynman.probing} onClick={() => finishClarify(false)}>
                  아직 모르겠어요
                </Button>
                <Button size="sm" variant="utility" disabled={feynman.probing} onClick={() => finishClarify(true)}>
                  네, 이해했어요
                </Button>
              </div>
            </div>
          </div>
        )}
        </div>

      </div>
    </section>
  );

  // ── PDF 패널 (3-split 좌측) — 원본 자료 열람 ──
  const refSourceIsPdf = /\.pdf$/i.test(refSource);
  const pdfPane = (
    <section style={{ width: `${paneW.pdf}%`, minWidth: 280 }} className="flex min-w-0 shrink-0 flex-col border-r border-hairline">
      <PaneHeader
        label="PDF"
        // 목록이 이 노트가 아니라 이 공간의 것임을 밝힌다 — 자동 선택은 하지 않는다.
        hint={sources.length > 0 ? `이 공간의 원본 ${sources.length}개` : "원본 없음"}
        right={
          <div className="flex min-w-0 items-center gap-1.5">
            {sources.length > 0 && (
              <PaneSelect
                value={refSource}
                onChange={setRefSource}
                options={sources.map((s) => ({ value: s, label: s }))}
                placeholder="원본 고르기…"
              />
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
          <PdfViewer space={space} file={refSource} />
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
        hint={refCandidates.length > 0 ? `${targetName}의 위키 ${refCandidates.length}개` : "위키 없음"}
        right={
          <div className="flex min-w-0 items-center gap-1.5">
            {refCandidates.length > 0 && (
              <PaneSelect
                value={refWiki?.path ?? ""}
                onChange={setRefWikiPath}
                options={refCandidates.map((w) => ({ value: w.path, label: w.title }))}
                placeholder="위키 고르기…"
              />
            )}
            {refWiki && (
              <Button size="sm" variant="utility" className="shrink-0 whitespace-nowrap" onClick={() => onOpenWiki(targetSpace, refWiki.path)}>
                열기
              </Button>
            )}
          </div>
        }
      />
      <div className="min-h-0 flex-1 overflow-y-auto p-4">
        {refWiki ? (
          <>
            <h2 className="mb-3 text-[17px] font-bold text-ink">{refWiki.title}</h2>
            <Markdown source={refWiki.markdown} embedSpace={targetSpace} />
          </>
        ) : (
          <p className="pt-8 text-center text-[14px] text-ink-muted">
            저장 + AI 정리하면
            <br />
            이 노트의 위키가 여기 나타나요.
          </p>
        )}
      </div>
    </section>
  );

  return (
    <div className="flex h-full min-h-0 flex-col">
      {/* 본문 — [PDF] | 노트(고정) | [위키]. 디바이더로 폭 조절(더블클릭 = 초기화). 패널 토글은 노트 헤더 우측으로 이동 */}
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

// 저장 위치(과목) 선택 — 네이티브 select 는 팝업이 OS 스타일이라 테마를 안 따른다.
// 사이드바 정렬 드롭다운과 같은 팝오버 패턴(백드롭 + bg-surface 패널 + 체크 표시).
// 목록 끝의 "새 과목 폴더"로 여기서 바로 폴더를 만들고 그 과목으로 옮겨간다.
function SpacePicker({
  spaces,
  value,
  onChange,
  onCreate,
}: {
  spaces: KnowledgeSpace[];
  value: string;
  onChange: (slug: string) => void;
  onCreate: (name: string) => Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const [newName, setNewName] = useState<string | null>(null); // null = 생성 행 접힘
  const [creating, setCreating] = useState(false);
  const current = spaces.find((s) => s.slug === value);

  const close = () => {
    setOpen(false);
    setNewName(null);
  };
  const create = async () => {
    const name = (newName ?? "").trim();
    if (!name || creating) return;
    setCreating(true);
    await onCreate(name);
    setCreating(false);
    close();
  };

  return (
    <span className="relative inline-flex">
      <button
        type="button"
        aria-label="저장 위치"
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => (open ? close() : setOpen(true))}
        className={cn(
          "inline-flex items-center gap-1.5 rounded-full border border-hairline px-3 py-1 text-[12px] text-ink-muted transition-colors hover:bg-fill-subtle hover:text-ink",
          open && "bg-fill-subtle text-ink",
        )}
      >
        <Icons.FolderIcon size={13} className="text-ink-faint" />
        <span className="max-w-[150px] truncate font-medium text-ink">{current?.name ?? "저장 위치"}</span>
        <Icons.ChevronsUpDownIcon size={12} className="shrink-0 text-ink-faint" />
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-20" onClick={close} />
          <div role="listbox" className="absolute left-0 top-full z-30 mt-1 max-h-72 w-56 overflow-y-auto rounded-lg border border-hairline bg-surface p-1 shadow-elevated">
            {spaces.map((s) => (
              <button
                key={s.slug}
                type="button"
                role="option"
                aria-selected={s.slug === value}
                onClick={() => {
                  onChange(s.slug);
                  close();
                }}
                className={cn(
                  "flex w-full items-center justify-between gap-2 rounded-md px-2.5 py-1.5 text-left text-[13px] transition-colors",
                  s.slug === value ? "bg-fill-subtle font-medium text-ink" : "text-ink-2 hover:bg-surface-soft hover:text-ink",
                )}
              >
                <span className="truncate">{s.name}</span>
                {s.slug === value && <Icons.CheckIcon size={14} className="shrink-0 text-primary" />}
              </button>
            ))}

            <div className="my-1 h-px bg-hairline" />

            {newName === null ? (
              <button
                type="button"
                onClick={() => setNewName("")}
                className="flex w-full items-center gap-1.5 rounded-md px-2.5 py-1.5 text-left text-[13px] text-ink-2 transition-colors hover:bg-surface-soft hover:text-ink"
              >
                <Icons.FolderPlusIcon size={14} className="shrink-0 text-ink-faint" />
                <span>새 과목 폴더</span>
              </button>
            ) : (
              <div className="flex items-center gap-1 px-1 py-1">
                <input
                  autoFocus
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") void create();
                    if (e.key === "Escape") setNewName(null);
                  }}
                  placeholder="과목 이름"
                  aria-label="새 과목 이름"
                  className="min-w-0 flex-1 rounded-md border border-hairline bg-surface px-2 py-1 text-[13px] text-ink outline-none focus:border-primary"
                />
                <Button size="sm" variant="utility" disabled={!newName.trim() || creating} onClick={() => void create()}>
                  만들기
                </Button>
              </div>
            )}
          </div>
        </>
      )}
    </span>
  );
}

function PaneHeader({ label, hint, right }: { label?: string; hint?: string; right?: React.ReactNode }) {
  return (
    <div className="flex h-10 shrink-0 items-center justify-between gap-2 border-b border-hairline px-3">
      <p className="min-w-0 truncate">
        {label && <span className="ds-eyebrow text-ink-faint">{label}</span>}
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

// value="" 일 때 placeholder 옵션이 없으면 브라우저가 첫 옵션을 고른 것처럼 그린다 — 자동 선택을 없앤 이상 반드시 필요.
function PaneSelect({
  value,
  onChange,
  options,
  placeholder,
}: {
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
  placeholder?: string;
}) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="min-w-0 max-w-[180px] truncate rounded-md border border-hairline bg-surface px-2 py-1 text-[12px] text-ink outline-none"
    >
      {!value && <option value="">{placeholder ?? "고르기…"}</option>}
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  );
}

// 속성 토글 pill (AI 생성 · 되묻기) — 기존 checkbox 대체. 켜지면 primary 계열, 상태가 한눈에. 저장위치는 select pill 로 별도.
// PDF 한국어 요약 진행/종결 스트립 — 스트리밍 중엔 파형+중단, 종결 후엔 결과+닫기.
function SummaryStrip({ job, onCancel, onClose }: { job: PdfSummaryJob; onCancel: () => void; onClose: () => void }) {
  const streaming = job.status === "streaming";
  const label =
    job.status === "streaming"
      ? `AI가 PDF를 한국어로 요약하고 있어요 · ${job.text.length}자`
      : job.status === "failed"
        ? `요약 실패: ${job.error ?? "알 수 없는 오류"}`
        : job.status === "cancelled"
          ? "요약을 중단했어요 — 이어진 부분은 직접 고칠 수 있어요"
          : `요약 완료${job.truncated ? " · 원문이 길어 일부만" : ""}${job.warning ? ` · ${job.warning}` : ""}`;
  return (
    <div
      className={cn(
        "mt-2 flex shrink-0 items-center justify-between gap-3 rounded-md border px-3 py-2 text-[13px]",
        streaming ? "border-primary/40 bg-primary/[0.05] text-ink" : job.status === "failed" ? "border-warning/40 bg-warning/[0.06] text-ink" : "border-hairline bg-surface-soft text-ink-muted",
      )}
    >
      <span className="flex min-w-0 items-center gap-2">
        {streaming && <Icons.SparkleIcon size={14} className="shrink-0 text-primary" />}
        <span className="truncate">{label}</span>
      </span>
      {streaming ? (
        <button type="button" onClick={onCancel} className="shrink-0 rounded border border-hairline px-2 py-0.5 text-[12px] font-medium text-ink-muted hover:bg-surface hover:text-ink">
          중단
        </button>
      ) : (
        <button type="button" onClick={onClose} className="shrink-0 rounded px-2 py-0.5 text-[12px] font-medium text-ink-muted hover:text-ink">
          닫기
        </button>
      )}
    </div>
  );
}

function PropertyPill({ active, disabled, onClick, icon, children }: { active?: boolean; disabled?: boolean; onClick: () => void; icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <button
      type="button"
      aria-pressed={active}
      disabled={disabled}
      onClick={onClick}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-[12px] font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-45",
        active ? "border-primary/40 bg-primary/[0.08] text-primary" : "border-hairline text-ink-muted hover:bg-surface-soft hover:text-ink",
      )}
    >
      <span className={active ? "text-primary" : "text-ink-faint"}>{icon}</span>
      {children}
    </button>
  );
}
