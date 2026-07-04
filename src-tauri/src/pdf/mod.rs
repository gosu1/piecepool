//! PDF → 페이지별 텍스트 추출. SSOT: docs/20-backend/pdf-extraction.md.
//! pdf-extract 0.10.0 per-page API. 텍스트만 — .md 저장/미리보기 렌더 없음(그건 프론트).
//! 빈 페이지는 "" 로 보존(인덱스 압축 금지 → SourceRef.page 유지). 원본은 실패해도 삭제하지 않는다.

use std::path::Path;

use crate::error::AppError;
use crate::models::{PageText, PdfExtractResult};

fn pdf_err(msg: impl Into<String>) -> AppError {
    AppError {
        kind: "pdf_extract".into(),
        message: msg.into(),
    }
}

/// `<space>/sources/original-files/<file>` PDF 를 페이지별 텍스트로 추출.
pub fn extract(path: &Path) -> Result<PdfExtractResult, AppError> {
    if !path.exists() {
        return Err(AppError {
            kind: "not_found".into(),
            message: format!("PDF 없음: {}", path.display()),
        });
    }
    let pages = pdf_extract::extract_text_by_pages(path).map_err(|e| {
        let m = e.to_string();
        if m.to_lowercase().contains("encrypt") {
            pdf_err(format!("암호화된 PDF입니다. 잠금 해제 후 다시 시도하거나 텍스트를 직접 붙여넣으세요. ({m})"))
        } else {
            pdf_err(format!("PDF 텍스트 추출 실패 — 파일이 손상되었거나 PDF가 아닐 수 있습니다. 텍스트를 직접 붙여넣으세요. ({m})"))
        }
    })?;

    // 0-page 는 정상 PDF 아님. 스캔본(전부 빈 텍스트)은 성공으로 반환.
    if pages.is_empty() {
        return Err(pdf_err("0-page PDF 입니다.".to_string()));
    }
    let page_count = pages.len() as u32;
    let pages = pages
        .into_iter()
        .enumerate()
        .map(|(i, text)| PageText {
            page: (i + 1) as u32,
            text,
        })
        .collect();
    Ok(PdfExtractResult { page_count, pages })
}
