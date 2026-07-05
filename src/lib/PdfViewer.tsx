import { useEffect, useMemo, useRef, useState } from "react";
import { Document, Page, pdfjs } from "react-pdf";
import { cn } from "../ds";
import * as ipc from "./ipc";
import { clampPage, clampZoom } from "./pdfView";

// Inbox 작업 공간용 PDF 뷰어 — 연속 스크롤(지연 렌더) / 썸네일+단일 페이지, Ctrl+휠 줌.
// embed용 경량 뷰어는 FilePreview.tsx (설계: .superpowers/specs/2026-07-03-pdf-viewer-design.md).
// pdf.js 워커 설정은 모듈당 1회 — FilePreview 쪽에서 이미 설정됐으면 건드리지 않는다.
if (!pdfjs.GlobalWorkerOptions.workerSrc) {
  pdfjs.GlobalWorkerOptions.workerSrc = new URL("pdfjs-dist/build/pdf.worker.min.mjs", import.meta.url).toString();
}

const ZOOM_STEP = 0.1;

function Msg({ children, tone = "muted" }: { children: React.ReactNode; tone?: "muted" | "danger" }) {
  return (
    <div className={`m-4 rounded-md border border-dashed border-hairline bg-surface-soft px-4 py-3 text-[13px] ${tone === "danger" ? "text-danger" : "text-ink-muted"}`}>
      {children}
    </div>
  );
}

function TBtn({ children, onClick, disabled, title }: { children: React.ReactNode; onClick: () => void; disabled?: boolean; title?: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={title}
      className="shrink-0 whitespace-nowrap rounded border border-hairline px-2 py-0.5 hover:bg-surface-soft disabled:opacity-40 disabled:hover:bg-transparent"
    >
      {children}
    </button>
  );
}

export function PdfViewer({
  space,
  file,
  onExtractText,
  extractBusy,
}: {
  space: string;
  file: string;
  onExtractText?: () => void;
  extractBusy?: boolean;
}) {
  const [b64, setB64] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [numPages, setNumPages] = useState(0);
  const [cur, setCur] = useState(1);
  const [pageInput, setPageInput] = useState("1");
  const [zoom, setZoom] = useState(1);
  const [mode, setMode] = useState<"scroll" | "thumbs">("scroll");
  // 연속 모드에서 실제 <Page>를 렌더할 페이지 집합 — 나머지는 placeholder로 높이만 유지
  const [visible, setVisible] = useState<Set<number>>(new Set([1]));
  // 썸네일 레일에서 실제 <Page>를 렌더할 페이지 집합 — 수백 쪽 PDF 동시 렌더 방지
  const [thumbVisible, setThumbVisible] = useState<Set<number>>(new Set([1]));
  // 페이지별 scale=1 크기 — placeholder 크기 추정용 (크기 혼합 PDF에서 스크롤 점프 최소화)
  const [pageDims, setPageDims] = useState<Map<number, { w: number; h: number }>>(new Map());

  const bodyRef = useRef<HTMLDivElement | null>(null);
  const pageEls = useRef<(HTMLDivElement | null)[]>([]);
  const thumbEls = useRef<(HTMLButtonElement | null)[]>([]);
  const railRef = useRef<HTMLDivElement | null>(null);
  const curThumbRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    let alive = true;
    setB64(null);
    setErr(null);
    setNumPages(0);
    setCur(1);
    setVisible(new Set([1]));
    setThumbVisible(new Set([1]));
    setPageDims(new Map());
    ipc
      .readFileBytes(space, file)
      .then((b) => alive && setB64(b))
      .catch((e) => alive && setErr(String(e)));
    return () => {
      alive = false;
    };
  }, [space, file]);

  // 매 렌더 새 문자열을 file prop으로 주면 react-pdf가 PDF를 매번 다시 로드한다 — 반드시 고정
  const pdfData = useMemo(() => (b64 ? `data:application/pdf;base64,${b64}` : null), [b64]);

  useEffect(() => setPageInput(String(cur)), [cur]);

  // Ctrl+휠 줌 — React onWheel은 passive라 preventDefault가 안 먹음 → 네이티브 등록
  useEffect(() => {
    const el = bodyRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      if (!e.ctrlKey) return;
      e.preventDefault();
      setZoom((z) => clampZoom(z + (e.deltaY < 0 ? ZOOM_STEP : -ZOOM_STEP)));
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, []);

  // 연속 모드: 지연 렌더 + 현재 페이지 추적 (둘 다 IntersectionObserver)
  useEffect(() => {
    if (mode !== "scroll" || numPages === 0) return;
    const root = bodyRef.current;
    const els = pageEls.current.slice(0, numPages).filter((el): el is HTMLDivElement => !!el);
    // 뷰포트 ±800px 안쪽만 실제 렌더
    const lazy = new IntersectionObserver(
      (entries) => {
        setVisible((prev) => {
          const next = new Set(prev);
          for (const en of entries) {
            const p = Number((en.target as HTMLElement).dataset.page);
            if (en.isIntersecting) next.add(p);
            else next.delete(p);
          }
          return next;
        });
      },
      { root, rootMargin: "800px 0px" },
    );
    // 가장 많이 보이는 페이지를 현재 페이지로 — 줌으로 페이지가 뷰포트보다 커도 동작
    const ratios = new Map<number, number>();
    const track = new IntersectionObserver(
      (entries) => {
        for (const en of entries) ratios.set(Number((en.target as HTMLElement).dataset.page), en.intersectionRatio);
        let best = 0;
        let bestR = 0;
        ratios.forEach((r, p) => {
          if (r > bestR) {
            bestR = r;
            best = p;
          }
        });
        if (best > 0) setCur(best);
      },
      { root, threshold: [0, 0.25, 0.5, 0.75, 1] },
    );
    els.forEach((el) => {
      lazy.observe(el);
      track.observe(el);
    });
    return () => {
      lazy.disconnect();
      track.disconnect();
    };
  }, [mode, numPages]);

  // 썸네일 모드: 레일도 지연 렌더 — 레일 뷰포트 ±400px 안쪽만 실제 <Page> 렌더
  useEffect(() => {
    if (mode !== "thumbs" || numPages === 0) return;
    const els = thumbEls.current.slice(0, numPages).filter((el): el is HTMLButtonElement => !!el);
    const lazy = new IntersectionObserver(
      (entries) => {
        setThumbVisible((prev) => {
          const next = new Set(prev);
          for (const en of entries) {
            const p = Number((en.target as HTMLElement).dataset.page);
            if (en.isIntersecting) next.add(p);
            else next.delete(p);
          }
          return next;
        });
      },
      { root: railRef.current, rootMargin: "400px 0px" },
    );
    els.forEach((el) => lazy.observe(el));
    return () => lazy.disconnect();
  }, [mode, numPages]);

  // 썸네일 레일: 현재 항목이 보이게 유지
  useEffect(() => {
    if (mode === "thumbs") curThumbRef.current?.scrollIntoView({ block: "nearest" });
  }, [mode, cur]);

  const goTo = (p: number) => {
    const t = clampPage(p, numPages);
    setCur(t);
    if (mode === "scroll") pageEls.current[t - 1]?.scrollIntoView({ block: "start" });
  };

  const commitPageInput = () => {
    const n = parseInt(pageInput, 10);
    // 값이 현재 페이지 그대로면 goTo 생략 — blur마다 읽던 위치가 페이지 상단으로 튀는 것 방지
    if (Number.isNaN(n) || clampPage(n, numPages) === cur) setPageInput(String(cur));
    else goTo(n);
  };

  const pages = Array.from({ length: numPages }, (_, i) => i + 1);
  // 크기를 아직 모르는 페이지는 첫 로드된 페이지 크기로 추정 (그마저 없으면 높이 640)
  const defaultDim = pageDims.values().next().value ?? { w: 0, h: 640 };
  const dimOf = (p: number) => pageDims.get(p) ?? defaultDim;
  const recordDim = (p: number) => (pg: { originalWidth: number; originalHeight: number }) =>
    setPageDims((m) => (m.has(p) ? m : new Map(m).set(p, { w: pg.originalWidth, h: pg.originalHeight })));

  let body: React.ReactNode;
  if (err) body = <Msg tone="danger">원본을 불러오지 못했습니다: {file}</Msg>;
  else if (b64 === null) body = <Msg>불러오는 중… {file}</Msg>;
  else if (!b64) body = <Msg>원본 미리보기는 데스크톱(Tauri)에서 볼 수 있습니다: {file}</Msg>;
  else
    body = (
      <Document
        file={pdfData}
        onLoadSuccess={(d) => setNumPages(d.numPages)}
        onLoadError={(e) => setErr(String(e))}
        loading={<Msg>PDF 여는 중… {file}</Msg>}
        error={<Msg tone="danger">PDF를 열 수 없습니다: {file}</Msg>}
        className="h-full"
      >
        {mode === "scroll" ? (
          // items-center 금지 — 줌으로 페이지가 패널보다 넓어지면 왼쪽 오버플로가 스크롤 불가 영역이 됨.
          // mx-auto는 오버플로 시 마진이 0으로 붕괴해 왼쪽 끝까지 스크롤로 도달 가능.
          <div className="flex flex-col gap-3 p-4">
            {pages.map((p) => {
              const dim = dimOf(p);
              return (
                <div
                  key={p}
                  data-page={p}
                  ref={(el) => {
                    pageEls.current[p - 1] = el;
                  }}
                  className="mx-auto shadow-elevated"
                  style={visible.has(p) ? undefined : { height: dim.h * zoom, width: dim.w ? dim.w * zoom : "100%" }}
                >
                  {visible.has(p) && (
                    <Page pageNumber={p} scale={zoom} renderTextLayer={false} renderAnnotationLayer={false} onLoadSuccess={recordDim(p)} />
                  )}
                </div>
              );
            })}
          </div>
        ) : (
          <div className="flex h-full min-h-0">
            <div ref={railRef} className="w-[84px] shrink-0 overflow-y-auto border-r border-hairline p-2">
              {pages.map((p) => {
                const dim = dimOf(p);
                return (
                  <button
                    key={p}
                    type="button"
                    data-page={p}
                    ref={(el) => {
                      thumbEls.current[p - 1] = el;
                      if (p === cur) curThumbRef.current = el;
                    }}
                    onClick={() => setCur(p)}
                    className={cn(
                      "mb-2 block w-full rounded border p-0.5 text-center",
                      p === cur ? "border-primary" : "border-hairline hover:border-ink-faint",
                    )}
                  >
                    {thumbVisible.has(p) ? (
                      <Page pageNumber={p} width={64} renderTextLayer={false} renderAnnotationLayer={false} onLoadSuccess={recordDim(p)} />
                    ) : (
                      <div style={{ height: dim.w ? (64 * dim.h) / dim.w : 84 }} />
                    )}
                    <span className={cn("text-[11px]", p === cur ? "text-primary" : "text-ink-muted")}>{p}</span>
                  </button>
                );
              })}
            </div>
            <div className="min-w-0 flex-1 overflow-auto p-4">
              <Page pageNumber={clampPage(cur, numPages)} scale={zoom} renderTextLayer={false} renderAnnotationLayer={false} className="shadow-elevated" />
            </div>
          </div>
        )}
      </Document>
    );

  return (
    <div className="flex h-full min-h-0 flex-col">
      {/* 툴바 */}
      <div className="flex shrink-0 items-center gap-1.5 overflow-x-auto border-b border-hairline px-2 py-1.5 text-[13px] text-ink-2">
        <TBtn onClick={() => goTo(cur - 1)} disabled={cur <= 1} title="이전 페이지">
          ‹
        </TBtn>
        <input
          value={pageInput}
          onChange={(e) => setPageInput(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && commitPageInput()}
          onBlur={commitPageInput}
          className="w-10 rounded border border-hairline bg-surface px-1 py-0.5 text-center text-[12px] text-ink outline-none"
          aria-label="페이지 번호"
        />
        <span className="text-ink-muted">/ {numPages || "–"}</span>
        <TBtn onClick={() => goTo(cur + 1)} disabled={numPages > 0 && cur >= numPages} title="다음 페이지">
          ›
        </TBtn>
        <span className="mx-1 h-4 w-px bg-hairline" />
        <TBtn onClick={() => setZoom((z) => clampZoom(z - ZOOM_STEP))} title="축소">
          −
        </TBtn>
        <span className="w-11 text-center text-[12px]">{Math.round(zoom * 100)}%</span>
        <TBtn onClick={() => setZoom((z) => clampZoom(z + ZOOM_STEP))} title="확대">
          +
        </TBtn>
        <span className="mx-1 h-4 w-px bg-hairline" />
        <TBtn onClick={() => setMode((m) => (m === "scroll" ? "thumbs" : "scroll"))} title="레이아웃 전환">
          {mode === "scroll" ? "썸네일" : "연속"}
        </TBtn>
        <div className="flex-1" />
        {onExtractText && (
          <button
            type="button"
            onClick={onExtractText}
            disabled={extractBusy}
            className="shrink-0 whitespace-nowrap rounded border border-hairline px-2 py-0.5 text-[12px] hover:bg-surface-soft disabled:opacity-50 disabled:hover:bg-transparent"
          >
            텍스트 추출 → 에디터
          </button>
        )}
      </div>
      {/* 본문 — Ctrl+휠 줌 리스너가 붙는 컨테이너 */}
      <div ref={bodyRef} className={cn("min-h-0 flex-1", mode === "scroll" ? "overflow-y-auto" : "overflow-hidden")}>
        {body}
      </div>
    </div>
  );
}
