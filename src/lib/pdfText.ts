import * as ipc from "./ipc";
import type { PdfExtractResult } from "./generated/PdfExtractResult";

// PDF → 페이지별 텍스트. Rust(pdf/) 우선, 그가 못 다루는 인코딩만 pdf.js 가 받아낸다 (ADR-0010).
// 백엔드와 동일한 PdfExtractResult 를 돌려주므로 호출부 하류는 무변경.
// page 는 1-indexed, 빈 페이지는 "" 로 자리 보존 — 백엔드 규약과 동일(wikilink-embed.md §3).

/** base64 → Uint8Array (pdf.js 입력). */
export function base64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

/** 추출 결과에 쓸 만한 텍스트가 있는지 — 스캔본(전 페이지 "")이면 false. */
export function hasText(r: PdfExtractResult): boolean {
  return r.pages.some((p) => p.text.trim().length > 0);
}

/** pdf.js textContent items → 한 페이지 문자열. */
export function joinItems(items: { str?: string }[]): string {
  return items.map((i) => i.str ?? "").join("");
}

// pdfjs 는 지연 로드 — 이 모듈의 순수 함수만 쓰는 테스트(node)가 react-pdf 를 끌어오지 않게 한다.
// 워커 설정은 모듈당 1회, 이미 설정됐으면 건드리지 않는다(PdfViewer.tsx 와 동일 규약).
async function loadPdfjs() {
  const { pdfjs } = await import("react-pdf");
  if (!pdfjs.GlobalWorkerOptions.workerSrc) {
    pdfjs.GlobalWorkerOptions.workerSrc = new URL("pdfjs-dist/build/pdf.worker.min.mjs", import.meta.url).toString();
  }
  return pdfjs;
}

/** pdf.js 로 원본 bytes 에서 페이지별 텍스트 추출. */
export async function extractWithPdfJs(b64: string): Promise<PdfExtractResult> {
  const pdfjs = await loadPdfjs();
  const doc = await pdfjs.getDocument({ data: base64ToBytes(b64) }).promise;
  try {
    const pages = [];
    for (let i = 1; i <= doc.numPages; i++) {
      const page = await doc.getPage(i);
      const tc = await page.getTextContent();
      pages.push({ page: i, text: joinItems(tc.items as { str?: string }[]) });
    }
    return { pageCount: doc.numPages, pages };
  } finally {
    // 워커 메모리 해제 — 임포트마다 문서가 쌓이면 누수된다.
    await doc.destroy();
  }
}

/**
 * Rust 추출 우선, 그가 실패(인코딩 panic 등)하거나 텍스트를 못 뽑으면 pdf.js 로 재시도.
 * 둘 다 텍스트가 없으면(스캔본) 마지막 결과를 그대로 돌려준다 — 호출부가 빈 텍스트로 판정한다.
 */
export async function extractPdfTextWithFallback(space: string, file: string): Promise<PdfExtractResult> {
  let primary: PdfExtractResult | null = null;
  try {
    primary = await ipc.extractPdfText(space, file);
    if (hasText(primary)) return primary;
  } catch {
    // Rust 추출 실패 — pdf.js 폴백으로 간다. 사유는 폴백도 실패할 때만 의미가 있다.
  }
  // 브라우저(mock) 에선 readFileBytes 가 "" — 폴백 불가라 원래 결과를 유지한다.
  const b64 = await ipc.readFileBytes(space, file).catch(() => "");
  if (!b64) {
    if (primary) return primary;
    throw new Error("PDF 원본을 읽지 못했습니다");
  }
  const fallback = await extractWithPdfJs(b64);
  if (hasText(fallback)) return fallback;
  // 폴백도 빈 텍스트 = 스캔본. Rust 결과가 있으면 페이지 수가 정확한 그쪽을 유지.
  return primary ?? fallback;
}
