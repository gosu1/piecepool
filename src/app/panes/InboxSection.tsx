import { useEffect, useRef, useState } from "react";
import { Button, FileDropzone, Icons, cn } from "../../ds";
import type { KnowledgeSpace, WikiPage as WikiPageT } from "../../lib/types";
import * as ipc from "../../lib/ipc";
import { useImportStore } from "../../store/importStore";
import { isSynthesisPage } from "../../lib/llmApply";
import { draftNoteId } from "../../store/feynmanStore";
import { useFeynmanEditor } from "./useFeynmanEditor";
import { useInboxDraftStore, EMPTY_DRAFT, type InboxDraft, type PdfSummaryJob } from "../../store/inboxDraftStore";
import { runImageOcr } from "../../llm/ocr";
import { SlashBlockEditor } from "../../lib/SlashBlockEditor";
import { ConfirmDialog } from "../shell/Dialogs";
import { Markdown } from "../../lib/markdown";
import { FilePreview } from "../../lib/FilePreview";
import { PdfViewer } from "../../lib/PdfViewer";
import { renameRefs } from "../../lib/wikilink";
import { LOADING_QUOTES } from "../../lib/quotes";
import {
  getInboxPaneWidths,
  setInboxPaneWidth,
  clampPanePct,
  INBOX_PANE_DEFAULTS,
  getOutputLanguage,
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

// 저장+AI 정리 진행 3단계 — 오버레이 체크리스트용. parsing 은 archiving 직전 순간,
// clarify_pending 은 llm 단계의 일부로 본다(상태머신: importStore).
const IMPORT_STEPS = ["archiving", "llm_processing", "writing"] as const;
type StepState = "done" | "active" | "todo";
function importSteps(status: string): { label: string; state: StepState }[] {
  const cur =
    status === "parsing" ? 0 : status === "clarify_pending" ? 1 : IMPORT_STEPS.indexOf(status as (typeof IMPORT_STEPS)[number]);
  return IMPORT_STEPS.map((s, i) => ({
    label: IMPORT_STATUS_LABEL[s],
    state: i < cur ? "done" : i === cur ? "active" : "todo",
  }));
}

// 로딩 중 돌아가는 소개 문구 — 이 앱 '파인만' 기능의 유래(리처드 파인만)와 그와 통하는
// 학습론(안드레 카파시). 검증된 사실만 — 지어낸 인용 금지.
// 여기에 출처 검증된 명언(lib/quotes.ts)을 “번역 — 저자” 형식으로 섞어 돌린다.
// 짧은 것만 — 긴 명언(전문가 트윗·바이브 코딩)은 5초 팁 박스(360px)에 안 맞아 부팅 화면에서만 돈다.
const QUOTE_TIPS = LOADING_QUOTES.filter((q) => q.text.length <= 60).map((q) => `“${q.text}” — ${q.author}`);
const LOADING_TIPS = [
  ...QUOTE_TIPS,
  "리처드 파인만은 1965년 양자전기역학(QED) 연구로 노벨 물리학상을 받았어요.",
  "파인만 기법 — 개념을 처음 배우는 사람에게 설명하듯 자기 말로 풀어 보면, 막히는 곳이 곧 이해의 구멍이에요.",
  "파인만은 어려운 물리를 일상의 비유로 풀어내 ‘위대한 설명가’로 불렸어요.",
  "복잡한 입자 상호작용을 그림 하나로 — 그게 파인만 다이어그램이에요.",
  "안드레 카파시는 OpenAI 공동 창립 멤버이자 테슬라 오토파일럿 AI를 이끈 연구자예요.",
  "카파시는 스탠퍼드 딥러닝 강의 CS231n을 만들어 수많은 사람을 AI에 입문시켰어요.",
  "카파시는 micrograd·nanoGPT처럼 밑바닥부터 직접 구현하며 배우는 방식으로 유명해요.",
  "‘바이브 코딩(vibe coding)’이라는 말은 카파시가 만들었어요.",
  "직접 만들어 보고, 자기 말로 설명해 보기 — 파인만과 카파시가 말하는 진짜 이해의 기준이에요.",
];

/** 5초마다 다음 문구로 로테이션. 시작 위치는 랜덤 — 열 때마다 다른 문구부터. */
function LoadingTip() {
  const [i, setI] = useState(() => Math.floor(Math.random() * LOADING_TIPS.length));
  useEffect(() => {
    const t = setInterval(() => setI((v) => (v + 1) % LOADING_TIPS.length), 5000);
    return () => clearInterval(t);
  }, []);
  return (
    <p
      key={i}
      style={{ animation: "pp-fade-in 0.5s ease" }}
      className="max-w-[360px] px-6 text-center text-[12.5px] leading-relaxed text-ink-muted"
    >
      {LOADING_TIPS[i]}
    </p>
  );
}

/** 처리 중 패널 위를 덮는 로딩 오버레이 — 저장(단계 포함)·PDF 처리(라벨만) 공용. 부모에 relative 필요. */
function LoadingOverlay({ label, steps }: { label: string; steps?: { label: string; state: StepState }[] }) {
  return (
    <div className="absolute inset-0 z-30 flex flex-col items-center justify-center gap-3 bg-surface/60 backdrop-blur-sm">
      <span className="h-7 w-7 animate-spin rounded-full border-[2.5px] border-primary/20 border-t-primary" aria-hidden />
      <p className="text-[14px] font-medium text-ink">{label}</p>
      {steps && (
        <ol className="mt-1 flex flex-col gap-1.5">
          {steps.map((s) => (
            <li
              key={s.label}
              className={cn(
                "flex items-center gap-2 text-[13px]",
                s.state === "active" ? "font-medium text-ink" : s.state === "done" ? "text-ink-muted" : "text-ink-faint",
              )}
            >
              {s.state === "done" ? (
                <Icons.CheckIcon size={13} className="text-primary" />
              ) : (
                <span
                  className={cn(
                    "mx-[3px] inline-block h-[7px] w-[7px] rounded-full",
                    s.state === "active" ? "animate-pulse bg-primary" : "bg-ink-faint/40",
                  )}
                />
              )}
              {s.label}
            </li>
          ))}
        </ol>
      )}
      <LoadingTip />
    </div>
  );
}

/** 본문에서 그 파일의 임베드 줄만 걷어낸다(원본 삭제 시). 남는 빈 줄은 최대 1개로 접는다. */
function stripEmbed(body: string, file: string): string {
  return body
    .split("\n")
    .filter((l) => l.trim() !== `![[${file}]]`)
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

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
  // 위키 참조 패널·PDF 패널 모두 저장 대상 공간을 따라간다 — 원본은 노트와 같은 공간에 산다.
  const resolveTarget = (slug: string) => ({
    spaceId: slug === space ? spaceId : (spaces.find((s) => s.slug === slug)?.id ?? spaceId),
    existing: slug === space ? existing : (wikiBySlug[slug] ?? []),
    subjectIds: slug === space ? subjectIdsDefault : (wikiBySlug[slug]?.[0]?.subjectIds ?? []),
    // 다른 공간의 개념 — LLM 에게 함께 넘겨 폴더 간(CV↔LLM↔VLM) 관계를 만들게 한다.
    // 저장 대상 공간은 건드리지 않는다(병합 대상 아님). 그래프 "전체 과목" 뷰가 다리를 그려 준다.
    crossConcepts: Object.entries(wikiBySlug)
      .filter(([s]) => s !== slug)
      .flatMap(([s, pages]) =>
        (pages ?? [])
          .filter((w) => !isSynthesisPage(w))
          .map((w) => ({ id: w.conceptId, title: w.title, space: s })),
      ),
  });
  // ── 작성 상태 — 스토어 소유(탭 전환 언마운트에도 초안·PDF요약 스트림 생존). key = 이 노트 탭 id(draftKey) ──
  // 노트 = 탭 하나. 제목·본문·바인딩·패널·PDF·위키선택을 전부 draftKey 로 보존한다.
  const ds = useInboxDraftStore;
  // EMPTY_DRAFT 병합 — 없거나 옛 스키마(누락 필드) draft 여도 8필드가 항상 채워져 렌더가 안 깨진다.
  const noteDraft = { ...EMPTY_DRAFT, ...useInboxDraftStore((s) => s.drafts[draftKey]) };
  const summaryJob = useInboxDraftStore((s) => s.job);
  const { title, body, savedFile, savedSpace, savedSnapshot, panels, refWikiPath, refSource } = noteDraft;
  // 저장 대상 공간 = 이 노트가 속할 공간. 원본 PDF 도 여기 산다(노트↔원본은 같은 공간).
  // draft 에 persist — useState 면 탭 전환 언마운트에 리셋돼 원본과 노트가 어긋난다.
  const targetSpace = noteDraft.targetSpace || space;
  const write = (patch: Partial<InboxDraft>) => ds.getState().write(draftKey, patch);
  const setTitle = (v: string) => ds.getState().setTitle(draftKey, v);
  const setBody = (v: string) => ds.getState().setBody(draftKey, v);
  const appendBody = (v: string) => ds.getState().appendBody(draftKey, v);
  const setTitleIfEmpty = (v: string) => {
    if (!ds.getState().drafts[draftKey]?.title) setTitle(v);
  };
  const setRefWikiPath = (v: string) => write({ refWikiPath: v });
  const setRefSource = (v: string) => write({ refSource: v });
  // 업로드 기록 — 이 초안이 실제로 올린 파일만 이동·삭제 대상이다(본문 파싱 아님).
  // 지금 스토어의 목록에 이어 붙인다 — 렌더 클로저의 스냅샷을 쓰면 동시 업로드가 서로를 덮어쓴다.
  const addUpload = (file: string) => {
    const cur = ds.getState().drafts[draftKey]?.uploads ?? [];
    if (!cur.includes(file)) write({ uploads: [...cur, file] });
  };
  const togglePanel = (key: InboxPanelKey, open?: boolean) => write({ panels: { ...panels, [key]: open ?? !panels[key] } });
  // 이 노트 탭에서 요약 스트리밍 중이면 편집 잠금 + body 뒤에 미확정 텍스트를 파생 렌더.
  const summarizing = summaryJob?.noteKey === draftKey && summaryJob.status === "streaming";
  const editorValue = summarizing && summaryJob.text ? (body ? `${body}\n\n${summaryJob.text}` : summaryJob.text) : body;
  // 요약 완료 시 [!easy] 콜아웃 일괄 접기 트리거(done 이면 non-zero 로 바뀌어 1회 발화).
  const foldEasyKey = summaryJob?.noteKey === draftKey && summaryJob.status === "done" ? summaryJob.text.length : 0;
  const [withLlm, setWithLlm] = useState(true);
  const { job, runImport } = useImportStore();
  // 파인만 — 아직 저장 전이면 노트 id 가 없다. 노트=탭이므로 초안 id 는 탭(draftKey) 기준이어야
  // 탭끼리 판정이 섞이지 않는다. 저장되면 importStore 가 진짜 sourceId 로 옮긴다(adopt).
  const fy = useFeynmanEditor({ noteId: draftNoteId(draftKey), space, markdown: body, noteTitle: title });
  const busy = !!job && !["completed", "failed"].includes(job.status);

  // ── 참조 패널 상태 (선택 refSource·refWikiPath 는 draft 로 보존) ──
  // 원본은 "이 노트가 올린 PDF 하나"다 — 공간의 원본 목록에서 골라 쓰지 않는다(노트↔원본 1:1).
  // 동시 임포트(다중 drop) 대응 — 불리언이면 먼저 끝난 건이 busy 를 풀어버린다.
  // 카운터는 스토어 소유(비영속) — 컴포넌트 useState 면 탭 전환 언마운트에 0 으로 리셋돼 잠금이 풀린다.
  const pdfBusy = useInboxDraftStore((s) => (s.pdfJobs[draftKey] ?? 0) > 0);
  const beginPdfJob = () => ds.getState().beginPdfJob(draftKey);
  const endPdfJob = () => ds.getState().endPdfJob(draftKey);
  const [uploadOpen, setUploadOpen] = useState(false);
  const [confirmDelSrc, setConfirmDelSrc] = useState(false);
  const [srcErr, setSrcErr] = useState<string | null>(null);
  // 삭제 = 이 노트의 원본을 무르는 유일한 수단(잘못 올림). 원본 파일 + 본문 임베드를 함께 걷어야
  // 다시 올릴 수 있다 — 사용자가 명시적으로 누른 삭제이므로 자동 재작성 금지 계약에 걸리지 않는다.
  const deleteSource = async () => {
    setConfirmDelSrc(false);
    setSrcErr(null);
    try {
      await ipc.deleteSource(targetSpace, refSource);
      setBody(stripEmbed(ds.getState().drafts[draftKey]?.body ?? "", refSource));
      // 지운 파일은 더 이상 이 초안의 업로드가 아니다 — 남겨두면 폴더 변경이 없는 파일을 옮기려다 실패한다.
      write({ refSource: "", uploads: (ds.getState().drafts[draftKey]?.uploads ?? []).filter((u) => u !== refSource) });
    } catch (e) {
      setSrcErr(String(e));
    }
  };

  // 대상 공간을 바꾸면 원본도 따라 옮긴다 — 노트는 B 에, PDF 는 A 에 남으면 임베드가 깨진다.
  // 실패하면 공간 변경을 되돌린다(절반만 옮겨진 상태를 만들지 않는다).
  const changeTargetSpace = async (slug: string) => {
    if (slug === targetSpace) return;
    // PDF 처리 중에는 폴더를 바꾸지 않는다 — 업로드는 시작할 때의 공간에 파일을 쓰므로,
    // 지금 대상만 바꾸면 파일은 옛 공간에, 노트는 새 공간에 남아 임베드가 깨진다.
    // 렌더 클로저의 pdfBusy 가 아니라 스토어를 직접 읽는다 — onCreate 경로는 새 공간 생성을
    // await 한 뒤 여기 오므로, 그 사이 시작된 업로드가 클로저에는 안 보인다.
    if ((ds.getState().pdfJobs[draftKey] ?? 0) > 0) {
      onNotice?.("PDF를 처리하는 중이에요 — 끝난 뒤에 폴더를 바꿔주세요");
      return;
    }
    const d = ds.getState().drafts[draftKey];
    const src0 = d?.refSource ?? "";
    // PDF 하나가 아니라 이 노트가 올린 원본 전부(이미지 포함)를 옮긴다 — 하나라도 남으면 임베드가 깨진다.
    // 본문 파싱이 아니라 "이 초안이 올린 것"만 옮긴다 — 손으로 친 ![[남의파일.pdf]] 까지 옮기면 남의 노트가 깨진다.
    const files = d?.uploads ?? [];
    // 이미 저장한 노트가 이 원본들을 참조 중이면 옮길 수 없다 — 디스크의 .md 는 그대로라 임베드가 영영 깨진다.
    if (files.length && d?.savedFile && d.savedSpace === targetSpace) {
      onNotice?.("이미 저장한 노트가 이 원본을 참조해요 — 폴더를 바꾸려면 새 노트로 시작하세요");
      return;
    }
    if (!files.length) {
      write({ targetSpace: slug });
      return;
    }
    beginPdfJob(); // 이동 중 저장 잠금 — 어느 공간에도 파일이 없는 순간이 있다
    // 하나씩 옮기며 리네임을 [from, to] 쌍으로만 누적한다. 대상 충돌로 이름이 바뀔 수 있으므로 반환된 이름을 쓴다.
    // body 문자열을 await 너머로 들고 가지 않는다 — 이동 중에도 사용자는 계속 타이핑하고 PDF 요약이 본문에
    // 병합될 수 있어, 옛 스냅샷을 쓰면 그 사이 편집이 통째로 지워진다. 쓸 때 살아있는 body 를 다시 읽어 재생한다.
    const renames: [string, string][] = [];
    let ref = src0;
    const ups = [...files]; // 리네임을 반영해 갱신할 업로드 목록(초안의 새 uploads)
    const done: string[] = []; // 이미 옮긴 파일들의 새 공간에서의 이름(롤백용)
    // 충돌 리네임 하나를 누적 — 본문(재생용)·refSource·uploads 셋 다 새 이름을 가리켜야 한다.
    const rename = (from: string, to: string) => {
      renames.push([from, to]);
      if (ref === from) ref = to;
      const i = ups.indexOf(from);
      if (i >= 0) ups[i] = to;
    };
    // 지금 스토어의 body 에 누적 리네임을 재생 — 리네임이 없으면 body 는 아예 건드리지 않는다.
    const replay = () => {
      const b = ds.getState().drafts[draftKey]?.body ?? "";
      return renames.reduce((acc, [f, t]) => renameRefs(acc, f, t), b);
    };
    try {
      for (const f of files) {
        const moved = await ipc.moveSource(targetSpace, slug, f);
        done.push(moved);
        if (moved !== f) rename(f, moved);
      }
      write({ targetSpace: slug, refSource: ref, uploads: ups, ...(renames.length ? { body: replay() } : {}) });
    } catch (e) {
      // 절반만 옮겨진 상태 — 옮긴 것들을 최선을 다해 되돌리고 폴더 변경은 포기한다.
      // 되돌리다 또 충돌 리네임될 수 있으니 그 이름도 본문·refSource·uploads 에 반영한다.
      // (되돌리기까지 실패하면 그 파일은 새 공간에 남지만, 본문은 이미 그 이름을 가리킨다.)
      for (const moved of done) {
        try {
          const back = await ipc.moveSource(slug, targetSpace, moved);
          if (back !== moved) rename(moved, back);
        } catch {
          // 되돌리기 실패 — 사용자에게는 아래 onNotice 로 알린다
        }
      }
      // 폴더는 그대로 두되, 이름이 바뀐 게 있으면 draft 가 파일의 실제 위치를 가리키도록 반영한다.
      if (renames.length || ref !== src0) write({ refSource: ref, uploads: ups, ...(renames.length ? { body: replay() } : {}) });
      onNotice?.(`원본을 옮기지 못했어요 — 폴더를 그대로 둡니다 (${String(e)})`);
    } finally {
      endPdfJob();
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

  // PDF → sources/original-files 저장 + 패널 열람 + 출처 임베드 + 한국어 번역·요약 스트리밍.
  // 요약은 스토어가 소유(fire-and-forget) — 탭을 떠나도 계속 흐르고 종결 시 본문에 병합된다.
  // 같은 PDF 를 다른 노트에서 또 올리면 백엔드가 `-2` 접미사로 별개 파일을 만든다 — 의도된 것이다.
  // 원본을 노트끼리 공유하면 한쪽에서 삭제·이동할 때 다른 노트의 임베드가 깨진다.
  const importPdf = async (f: File) => {
    beginPdfJob();
    try {
      const stored = await ipc.saveSourceFile(targetSpace, f.name, await fileToBase64(f));
      addUpload(stored);
      setRefSource(stored);
      // 올린 PDF 를 바로 볼 수 있게 PDF 패널 자동 열림
      togglePanel("pdf", true);
      setTitleIfEmpty(f.name.replace(/\.[^.]+$/, ""));
      // 출처 연결용 임베드만 삽입(현재 출처 연결이 본문 ![[...]] 파싱에 의존 — 2단계에서 메타데이터로 이관 예정)
      appendBody(`![[${stored}]]`);
      // PDF 내용 → 한국어 요약 스트리밍. 추출/키없음/타 요약 진행 중이면 embed 만 남기고 안내.
      try {
        const ext = await ipc.extractPdfText(targetSpace, stored);
        const text = ext.pages.map((p) => p.text).join("\n\n").trim();
        if (!text) return;
        const apiKey = (typeof localStorage !== "undefined" && localStorage.getItem("gemini-key")) || "";
        if (!apiKey) {
          const langName = getOutputLanguage() === "en" ? "영어" : "한국어";
          onNotice?.(`AI 요약 키가 없어요 — 설정에서 Gemini 키를 넣으면 PDF를 ${langName}로 요약해요`);
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
      endPdfJob();
    }
  };

  // 파일 1개 처리 — 여러 개 드랍/선택 시 각각 순서대로 에디터에 누적된다. PDF 는 onFiles 가 따로 건다.
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
      // PDF 와 같은 pdfJobs 잠금을 건다 — 임베드는 OCR 이 끝난 뒤에야 본문에 붙으므로, 그 사이 폴더를
      // 바꾸면 옮길 파일이 본문에 안 보여 이미지는 옛 공간에 남고 임베드만 새 공간을 가리켜 깨진다.
      beginPdfJob();
      void (async () => {
        try {
          // FileReader → Promise 로 감싼다: onerror·읽기 실패도 reject 로 받아야 finally 가 카운터를 반드시 푼다
          // (콜백이 끝내 안 오면 잠금이 영영 안 풀려 저장·폴더 변경이 잠긴다).
          const dataUrl = await new Promise<string>((res, rej) => {
            const reader = new FileReader();
            reader.onload = () => res(String(reader.result ?? ""));
            reader.onerror = () => rej(reader.error);
            reader.readAsDataURL(f);
          });
          setTitleIfEmpty(stem);
          // 원본 이미지를 sources/original-files 에 저장하고 embed 로 연결 — OCR 실패/키 없음이어도 이미지는 남는다.
          let embed = "";
          try {
            const stored = await ipc.saveSourceFile(targetSpace, f.name, dataUrl.split(",")[1] ?? "");
            addUpload(stored);
            embed = `![[${stored}]]\n\n`;
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
        } catch (e) {
          onNotice?.(`${f.name} 읽기 실패: ${String(e)}`);
        } finally {
          endPdfJob();
        }
      })();
    } else {
      appendBody(`> ${f.name} — 지원하지 않는 형식이에요 (md/txt/pdf/이미지).`);
    }
  };

  // 노트 하나 = PDF 하나. 이미 원본이 있으면 새 PDF 를 받지 않는다 — 바꾸려면 삭제가 먼저다.
  // (sourceRefs 가 노트당 대표 파일 1개만 쓴다: llmApply.ts embedSourceFiles)
  const isPdf = (f: File) => /\.pdf$/i.test(f.name) || f.type === "application/pdf";
  const onFiles = (files: FileList) => {
    const arr = Array.from(files);
    arr.filter((f) => !isPdf(f)).forEach(addFile);
    const pdfs = arr.filter(isPdf);
    if (!pdfs.length) return;
    if (pdfBusy || ds.getState().drafts[draftKey]?.refSource) {
      onNotice?.("이 노트엔 이미 원본이 있어요 — 바꾸려면 PDF 패널에서 삭제 후 다시 올려주세요");
      return;
    }
    if (pdfs.length > 1) onNotice?.("노트 하나에 PDF 하나예요 — 첫 파일만 올렸어요");
    void importPdf(pdfs[0]);
  };

  const run = async () => {
    // pdfBusy/summarizing 게이트: 요약 완료 전 저장하면 아카이브에 PDF 요약이 빠진 채 저장되고
    // 뒤늦은 요약이 비워진 에디터에 고아로 삽입된다.
    if (!title.trim() || busy || pdfBusy || summarizing) return;
    const t = resolveTarget(targetSpace);
    // 재저장(saveNote)은 savedFile 이 그 공간에 있을 때만 — 대상 공간을 바꿨으면 새 노트로(다른 공간 노트 덮어쓰기 방지).
    const reuse = savedFile && savedSpace === targetSpace ? savedFile : undefined;
    const res = await runImport({
      space: targetSpace,
      spaceId: t.spaceId,
      title: title.trim(),
      markdown: body,
      subjectIds: t.subjectIds,
      withLlm,
      existing: t.existing,
      crossConcepts: t.crossConcepts,
      noteFile: reuse,
      feynmanNoteId: draftNoteId(draftKey),
    });
    // 생성/갱신된 노트에 바인딩(살아있는 노트) — 노트를 비우지 않고 이어서 필기.
    if (res.noteFile) write({ savedFile: res.noteFile, savedSpace: targetSpace });
    if (res.status === "completed") {
      write({ savedSnapshot: `${title.trim()} ${body}` });
      await onRefresh(targetSpace);
      onNotice?.(
        res.feynmanUsed
          ? "파인만에서 쓴 설명까지 위키에 반영됐어요 ✓ — 이어서 필기하세요"
          : withLlm
            ? "위키에 반영됐어요 ✓ — 이어서 필기하세요"
            : "저장됐어요 ✓ — 이어서 필기하세요",
      );
      // 방금 만든 위키가 있을 때만 위키 패널을 연다 (참조 패널은 저장 대상 공간을 따르므로 다른 공간에 저장해도 뜬다)
      if (withLlm && res.firstWikiPath) {
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
  // 패널 토글 버튼은 여기 없다. 타이틀바(InboxPanelToggles)가 그린다 — 노트 패널 안에 두면
  // 패널이 열릴 때 노트 폭이 줄며 버튼이 딸려 움직여, 방금 누른 버튼이 도망가 다시 눌러 닫기가
  // 어려웠다. 패널에 자체 닫기 버튼도 없어 그 토글이 닫는 유일한 방법이었다.
  const notePane = (
    <section style={{ minWidth: NOTE_MIN_PX }} className="flex min-w-0 flex-1 flex-col">
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
              onChange={(slug) => void changeTargetSpace(slug)}
              onCreate={async (name) => {
                const slug = await onCreateSpace(name);
                if (slug) await changeTargetSpace(slug);
              }}
            />
            <PropertyPill active={withLlm} onClick={() => setWithLlm(!withLlm)} icon={<Icons.SparkleIcon size={13} />}>
              AI 생성
              {withLlm && <Icons.CheckIcon size={12} className="ml-0.5" />}
            </PropertyPill>
            {/* 파인만 — 토글이 아니라 액션이다. 누르면 지금 이 글 전체를 자기 말로 설명하게 한다.
                (섹션 하나만 하려면 그 부분을 드래그하면 선택 위에 버튼이 뜬다) */}
            <PropertyPill disabled={!fy.canStart} onClick={fy.startWhole} icon={<Icons.HelpCircleIcon size={13} />}>
              파인만
            </PropertyPill>
            {/* 퀵메모 — 창 열림/닫힘을 그대로 반영하는 토글. AI 생성 여부와 무관하게 항상 쓸 수 있다. */}
            <PropertyPill active={quickMemoOpen} onClick={onToggleQuickMemo} icon={<Icons.EditIcon size={13} />}>
              퀵메모
            </PropertyPill>
          </div>
        </div>
        {/* 캔버스 — 에디터 + 주액션 (수집의 본체) */}
        <div className="relative flex min-h-0 flex-1 flex-col p-4">
          <div className="relative min-h-[160px] flex-1 pt-1">
          {/* AI 요약 — 첫 delta 전(TTFT 대기)만 덮는다. 텍스트가 흐르기 시작하면 걷어서
              실시간 스트리밍이 그대로 보이게 한다. 취소는 아래 SummaryStrip — 가리지 않는다. */}
          {summarizing && !summaryJob?.text && <LoadingOverlay label="AI 요약 중…" />}
          <SlashBlockEditor
            value={editorValue}
            onChange={setBody}
            onSubmit={run}
            onSelect={fy.onSelect}
            headingAction={fy.headingAction}
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

        {/* 저장+AI 정리 진행 오버레이 — 단계는 AI 켰을 때만(끄면 원본 저장 한 단계뿐이라 라벨로 충분) */}
        {busy && (
          <LoadingOverlay
            label={`${IMPORT_STATUS_LABEL[job!.status]} 중…`}
            steps={withLlm ? importSteps(job!.status) : undefined}
          />
        )}
        {fy.overlay}
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
        // 이 노트가 올린 원본 하나만 보여준다 — 공간의 원본 목록에서 고르는 기능은 없다.
        hint={refSource || "원본 없음"}
        right={
          <div className="flex min-w-0 items-center gap-1.5">
            {refSource && (
              // 원본 처리(업로드·OCR·폴더 이동) 중엔 삭제 금지 — 이동 중 삭제하면 이동이 끝나며 지운 refSource 를 되쓴다.
              <Button size="sm" variant="utility" disabled={pdfBusy} className="shrink-0 whitespace-nowrap" onClick={() => setConfirmDelSrc(true)}>
                삭제
              </Button>
            )}
            {/* 업로드는 항상 열려 있다 — PDF 는 1개 게이트(onFiles)에 걸리지만 이미지·md 는 계속 받는다. */}
            <Button size="sm" variant="utility" className="shrink-0 whitespace-nowrap" onClick={() => setUploadOpen(true)}>
              업로드
            </Button>
          </div>
        }
      />
      {srcErr && <p className="shrink-0 border-b border-hairline px-4 py-1.5 text-[13px] text-danger">원본 삭제 실패: {srcErr}</p>}
      {refSource && refSourceIsPdf ? (
        <div className="relative flex min-h-0 flex-1 flex-col">
          {pdfBusy && <LoadingOverlay label="PDF 저장·텍스트 추출 중…" />}
          <PdfViewer space={targetSpace} file={refSource} />
        </div>
      ) : (
        <div className="relative min-h-0 flex-1 overflow-y-auto p-4">
          {/* 원본이 아직 안 붙은 초기 단계(저장 전)·이미지 OCR 도 이 분기 — PDF 한정 문구를 쓰지 않는다 */}
          {pdfBusy && <LoadingOverlay label="원본 처리 중…" />}
          {refSource ? (
            <FilePreview space={targetSpace} target={refSource} />
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

// ══ 보조 패널(PDF·위키) 토글 — 타이틀바에 얹힌다 ══
// 노트 패널 안에 두면 패널이 열릴 때 노트 폭이 줄며 버튼이 딸려 움직인다. 방금 누른 버튼이
// 도망가니 다시 눌러 닫기가 어려웠다(패널에 자체 닫기 버튼이 없어 이게 유일한 방법이다).
// 타이틀바는 패널 개폐와 무관하게 고정이라 버튼이 제자리에 있다.
// 상태는 inboxDraftStore 의 노트별 draft(panels) — InboxSection 과 같은 진실을 본다.
export function InboxPanelToggles({ draftKey }: { draftKey: string }) {
  const panels = useInboxDraftStore((s) => s.drafts[draftKey]?.panels ?? EMPTY_DRAFT.panels);
  const write = useInboxDraftStore((s) => s.write);
  return (
    <div className="flex shrink-0 items-center gap-0.5 rounded-md border border-hairline p-0.5">
      {(["pdf", "wiki"] as const).map((k, i) => (
        <span key={k} className="flex items-center gap-0.5">
          {/* 두 토글은 각각 독립이다(둘 다 켜질 수 있다) — 구분선으로 하나의 세그먼트가 아님을 알린다 */}
          {i > 0 && <span className="h-3.5 w-px bg-hairline" />}
          <button
            type="button"
            aria-pressed={panels[k]}
            onClick={() => write(draftKey, { panels: { ...panels, [k]: !panels[k] } })}
            className={cn(
              "rounded px-2.5 py-1 text-[12px] font-medium transition-colors",
              panels[k] ? "bg-surface-soft text-ink" : "text-ink-muted hover:text-ink",
            )}
          >
            {k === "pdf" ? "PDF 패널" : "위키 패널"}
          </button>
        </span>
      ))}
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

// 속성 토글 pill (AI 생성 · 파인만) — 기존 checkbox 대체. 켜지면 primary 계열, 상태가 한눈에. 저장위치는 select pill 로 별도.
// PDF 요약(생성 언어 설정 준수) 진행/종결 스트립 — 스트리밍 중엔 파형+중단, 종결 후엔 결과+닫기.
function SummaryStrip({ job, onCancel, onClose }: { job: PdfSummaryJob; onCancel: () => void; onClose: () => void }) {
  const streaming = job.status === "streaming";
  const label =
    job.status === "streaming"
      ? `AI가 PDF를 ${getOutputLanguage() === "en" ? "영어" : "한국어"}로 요약하고 있어요 · ${job.text.length}자`
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
