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

/// `catch_unwind` payload(Box<dyn Any>)에서 사람이 읽을 panic 메시지를 뽑는다.
fn panic_detail(payload: &(dyn std::any::Any + Send)) -> String {
    if let Some(s) = payload.downcast_ref::<&str>() {
        (*s).to_string()
    } else if let Some(s) = payload.downcast_ref::<String>() {
        s.clone()
    } else {
        "알 수 없는 추출 오류".to_string()
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
    // pdf-extract 0.10 은 특정 폰트/CMap 인코딩(예: 한글 UniKS-UTF16-H)에서 Err 를 반환하는
    // 대신 내부에서 panic 한다. catch_unwind 로 그 panic 을 삼켜 앱 크래시를 막고, 통상 Err 와
    // 동일하게 사용자 안내 메시지로 변환한다. (Cargo 기본 unwind 전략 전제 — abort 면 무효)
    let extraction = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
        pdf_extract::extract_text_by_pages(path)
    }));
    let pages = match extraction {
        Ok(Ok(pages)) => pages,
        Ok(Err(e)) => {
            let m = e.to_string();
            return Err(if m.to_lowercase().contains("encrypt") {
                pdf_err(format!("암호화된 PDF입니다. 잠금 해제 후 다시 시도하거나 텍스트를 직접 붙여넣으세요. ({m})"))
            } else {
                pdf_err(format!("PDF 텍스트 추출 실패 — 파일이 손상되었거나 PDF가 아닐 수 있습니다. 텍스트를 직접 붙여넣으세요. ({m})"))
            });
        }
        Err(payload) => {
            return Err(pdf_err(format!(
                "이 PDF의 폰트/인코딩을 지원하지 않아 자동 추출에 실패했습니다. 텍스트를 직접 붙여넣으세요. ({})",
                panic_detail(&*payload)
            )));
        }
    };

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

#[cfg(test)]
mod tests {
    use super::*;

    fn fixture(name: &str) -> std::path::PathBuf {
        std::path::Path::new(env!("CARGO_MANIFEST_DIR"))
            .join("tests/fixtures")
            .join(name)
    }

    // 특정 폰트/CMap 인코딩 PDF 에서 pdf-extract 내부가 panic → 앱 강제 종료(RS-bug).
    // extract() 는 그 panic 을 삼켜 AppError 로 돌려줘야 한다(앱은 살아 있고 사용자에게 안내).
    #[test]
    fn encoding_panic_pdf_returns_err_not_panic() {
        let path = fixture("adversarial-vit-korean.pdf");
        // panic 이 새어 나오면 이 테스트가 실패한다(재현). 수정 후엔 Err(AppError) 로 정상 반환.
        let r = extract(&path);
        assert!(
            r.is_err(),
            "인코딩 panic PDF 는 크래시 대신 Err 로 처리돼야 한다"
        );
    }
}
