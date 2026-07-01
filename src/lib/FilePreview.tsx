import { useEffect, useState } from "react";
import { Document, Page, pdfjs } from "react-pdf";
import * as ipc from "./ipc";
import { parseEmbedTarget } from "./wikilink";

// 원본 파일 미리보기 — 이미지(data URL) / PDF(react-pdf). 규약: docs/10-contracts/wikilink-embed.md.
// pdf.js 워커는 Vite 번들에서 로드. #page=N 범위 초과 시 1쪽 렌더 + 오류 표시(크래시 금지).
pdfjs.GlobalWorkerOptions.workerSrc = new URL("pdfjs-dist/build/pdf.worker.min.mjs", import.meta.url).toString();

function Box({ children, tone = "muted" }: { children: React.ReactNode; tone?: "muted" | "danger" }) {
  return (
    <div className={`rounded-md border border-dashed border-hairline bg-surface-soft px-4 py-3 text-[13px] ${tone === "danger" ? "text-danger" : "text-ink-muted"}`}>
      {children}
    </div>
  );
}

const MIME: Record<string, string> = { png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", webp: "image/webp", gif: "image/gif", svg: "image/svg+xml" };

export function FilePreview({ space, target }: { space: string; target: string }) {
  const { file, page } = parseEmbedTarget(target);
  const ext = file.split(".").pop()?.toLowerCase() ?? "";
  const isImage = ext in MIME;
  const isPdf = ext === "pdf";

  const [b64, setB64] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [numPages, setNumPages] = useState(0);
  const [cur, setCur] = useState(page ?? 1);

  useEffect(() => {
    let alive = true;
    setB64(null);
    setErr(null);
    ipc
      .readFileBytes(space, file)
      .then((b) => alive && setB64(b))
      .catch((e) => alive && setErr(String(e)));
    return () => {
      alive = false;
    };
  }, [space, file]);

  if (err) return <Box tone="danger">원본을 불러오지 못했습니다: {file}</Box>;
  if (b64 === null) return <Box>불러오는 중… {file}</Box>;
  if (!b64) return <Box>원본 미리보기는 데스크톱(Tauri)에서 볼 수 있습니다: {file}</Box>;

  if (isImage) {
    return <img src={`data:${MIME[ext]};base64,${b64}`} alt={file} className="max-w-full rounded-md border border-hairline" />;
  }

  if (isPdf) {
    const over = numPages > 0 && (page ?? 1) > numPages;
    const shown = numPages > 0 ? (over ? 1 : Math.min(Math.max(cur, 1), numPages)) : cur;
    return (
      <div className="space-y-2">
        <Document
          file={`data:application/pdf;base64,${b64}`}
          onLoadSuccess={(d) => setNumPages(d.numPages)}
          onLoadError={(e) => setErr(String(e))}
          loading={<Box>PDF 여는 중… {file}</Box>}
          error={<Box tone="danger">PDF를 열 수 없습니다: {file}</Box>}
        >
          <Page pageNumber={shown} width={520} renderTextLayer={false} renderAnnotationLayer={false} />
        </Document>
        {over && <p className="text-[12px] text-danger">요청한 {page}쪽이 범위를 벗어남(총 {numPages}쪽) — 1쪽을 표시합니다.</p>}
        {numPages > 1 && (
          <div className="flex items-center gap-3 text-[13px] text-ink-2">
            <button type="button" onClick={() => setCur((c) => Math.max(1, c - 1))} className="rounded border border-hairline px-2 py-0.5 hover:bg-surface-soft">
              이전
            </button>
            <span>
              {shown} / {numPages}
            </span>
            <button type="button" onClick={() => setCur((c) => Math.min(numPages, c + 1))} className="rounded border border-hairline px-2 py-0.5 hover:bg-surface-soft">
              다음
            </button>
          </div>
        )}
      </div>
    );
  }

  return <Box>미리보기를 지원하지 않는 형식입니다: {file}</Box>;
}
