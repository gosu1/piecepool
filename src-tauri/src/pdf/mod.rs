//! PDF → 페이지별 텍스트 추출. SSOT: docs/20-backend/pdf-extraction.md.
//! pdf-inspector 1.17 per-page API (PIE-74). 텍스트만 — .md 저장/미리보기 렌더 없음(그건 프론트).
//! 빈 페이지는 "" 로 보존(인덱스 압축 금지 → SourceRef.page 유지). 원본은 실패해도 삭제하지 않는다.

use std::path::Path;

use pdf_inspector::PdfError;

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

/// pdf-inspector 의 실패를 사용자 안내 메시지로 옮긴다.
/// 암호화는 사용자가 직접 조치(암호 해제)할 수 있어 따로 분리한다
/// (pdf-extraction.md §3.1). 옛 pdf-extract 는 이 구분을 에러 문자열에서
/// "encrypt" 를 찾아 했지만, 이제 타입으로 갈린다.
fn map_err(e: PdfError) -> AppError {
    match e {
        PdfError::Encrypted => pdf_err(
            "암호화된 PDF입니다. 잠금 해제 후 다시 시도하거나 텍스트를 직접 붙여넣으세요.",
        ),
        other => pdf_err(format!(
            "PDF 텍스트 추출 실패 — 파일이 손상되었거나 PDF가 아닐 수 있습니다. 텍스트를 직접 붙여넣으세요. ({other})"
        )),
    }
}

/// 한글·일본어·중국어 PDF 가 "Adobe 가 정한 표를 쓰라"고 이름만 적어둔 경우, 그 표(bcmap)를
/// 읽는 쪽이 갖고 있어야 글자가 나온다. pdf-inspector 는 네이티브 빌드에서 이 표를
/// 파일시스템에서 읽는다(내장은 wasm 타깃만).
///
/// 환경변수를 안 걸면 라이브러리는 **빌드한 기계의 카고 캐시 경로**를 본다. 그래서 개발
/// 기계에서는 우연히 동작하고 배포 앱에서는 예외도 로그도 없이 한글 CID 폰트 처리만 빠진다.
/// 앱 시작 때 반드시 불러야 하는 이유가 이것이다(lib.rs setup).
pub fn set_bcmaps_dir(dir: &Path) -> Result<(), AppError> {
    // 표가 실제로 있는지 여기서 확인한다. 라이브러리는 없으면 그냥 안 쓰고 넘어가므로,
    // 확인을 여기서 안 하면 실패가 어디에도 안 남는다.
    if !dir.join("Adobe-Korea1-UCS2.bcmap").is_file() {
        return Err(pdf_err(format!(
            "PDF 글자 대응표(bcmap)를 찾지 못했습니다: {}",
            dir.display()
        )));
    }
    std::env::set_var("PDF_INSPECTOR_BCMAPS_DIR", dir);
    Ok(())
}

/// `<space>/sources/original-files/<file>` PDF 를 페이지별 텍스트로 추출.
pub fn extract(path: &Path) -> Result<PdfExtractResult, AppError> {
    if !path.exists() {
        return Err(AppError {
            kind: "not_found".into(),
            message: format!("PDF 없음: {}", path.display()),
        });
    }
    // pdf-inspector 는 실패를 PdfError 로 돌려주지만, 밑단 파서(lopdf)까지 panic 이 없다고
    // 보장하진 않는다. 사용자 파일을 서드파티에 물리는 자리라 catch_unwind 는 남긴다 —
    // 앱 크래시를 막고 통상 Err 와 같은 안내 메시지로 변환한다.
    // (Cargo 기본 unwind 전략 전제 — abort 면 무효)
    let extraction = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
        pdf_inspector::extract_pages_markdown(path, None)
    }));
    let pages = match extraction {
        Ok(Ok(r)) => r.pages,
        Ok(Err(e)) => return Err(map_err(e)),
        Err(payload) => {
            return Err(pdf_err(format!(
                "PDF 텍스트 추출 중 오류가 발생했습니다. 텍스트를 직접 붙여넣으세요. ({})",
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
        .map(|p| PageText {
            // PageMarkdown.page 는 0-indexed. 우리 계약은 1-indexed 다
            // (wikilink-embed.md §3.1 `[[file.pdf#page=N]]`) — 여기가 어긋나면
            // SourceRef.page 가 통째로 한 칸씩 밀린다.
            page: p.page + 1,
            text: p.markdown,
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

    fn hangul_count(r: &PdfExtractResult) -> usize {
        r.pages
            .iter()
            .flat_map(|p| p.text.chars())
            .filter(|c| ('가'..='힣').contains(c))
            .count()
    }

    /// 평범한 텍스트 PDF 는 1차 엔진이 혼자 읽어야 한다. 페이지 번호는 1-indexed —
    /// 라이브러리는 0-indexed 로 주므로(PageMarkdown.page) 여기가 변환의 회귀 방지선이다.
    #[test]
    fn text_pdf_extracts_with_1indexed_pages() {
        let r = extract(&fixture("simple-two-page.pdf")).expect("평범한 PDF 는 추출돼야 한다");
        assert_eq!(r.page_count, 2);
        assert_eq!(r.pages.len(), 2);
        assert_eq!(r.pages[0].page, 1, "첫 페이지는 1 이어야 한다");
        assert_eq!(r.pages[1].page, 2, "둘째 페이지는 2 여야 한다");
        assert!(
            r.pages[0].text.contains("PiecePool extraction fixture"),
            "1쪽 본문이 없다: {:?}",
            r.pages[0].text
        );
        assert!(
            r.pages[1].text.contains("Second page heading"),
            "2쪽 본문이 없다: {:?}",
            r.pages[1].text
        );
    }

    /// 한글 predefined CMap(UniKS-UTF16-H) 2단 조판 PDF. pdf-extract 는 여기서 내부 panic 했다.
    /// pdf-inspector 는 크래시 대신 "글자가 깨졌다"(suspected_garbled_text)고 판정해 해당 쪽을
    /// 빈 텍스트로 돌려준다. 그러면 프론트가 pdf.js 로 재추출한다(ADR-0011) — PIE-74 는 1차
    /// 엔진 교체이지 폴백 제거가 아니므로, 이 파일의 합격 조건은 "추출 성공"이 아니라
    /// **"크래시 없이, 폴백이 걸리는 모양으로 돌아온다"** 이다.
    ///
    /// 폴백 판정은 프론트 hasText() 가 pages[].text 가 전부 비었는지로 한다
    /// (src/lib/pdfText.ts). 여기서 텍스트가 조금이라도 새면 폴백이 안 걸리고
    /// 깨진 글자가 그대로 위키로 들어간다.
    #[test]
    fn korean_cmap_pdf_yields_empty_text_so_frontend_falls_back() {
        let r = extract(&fixture("adversarial-vit-korean.pdf"))
            .expect("추출 실패가 아니라 빈 텍스트로 돌아와야 한다");
        assert_eq!(r.page_count, 2);
        assert_eq!(r.pages[0].page, 1, "page 는 1-indexed 여야 한다");
        assert!(
            r.pages.iter().all(|p| p.text.trim().is_empty()),
            "텍스트가 새면 프론트 폴백이 안 걸린다"
        );
        assert_eq!(hangul_count(&r), 0);
    }

    /// 저장소에 넣어둔 bcmap 이 실제로 있어야 한다. 이게 비면 배포 앱에서 한글 CID 폰트
    /// 처리가 조용히 빠지는데, 개발 빌드는 카고 캐시로 우연히 동작해 눈치채지 못한다.
    #[test]
    fn vendored_bcmaps_ship_korean_maps() {
        let dir = std::path::Path::new(env!("CARGO_MANIFEST_DIR")).join("resources/bcmaps");
        for name in ["Adobe-Korea1-UCS2.bcmap", "UniKS-UTF16-H.bcmap"] {
            assert!(dir.join(name).is_file(), "{name} 이 없다");
        }
        let n = std::fs::read_dir(&dir).unwrap().count();
        assert!(n > 160, "bcmap 이 {n} 개뿐 — 복사가 덜 됐다");
    }

    /// 없는 경로를 조용히 받아 넘기면 "걸었다고 믿는데 안 걸린" 상태가 된다.
    #[test]
    fn set_bcmaps_dir_rejects_missing_dir() {
        let missing = std::env::temp_dir().join("piecepool-pie74-no-such-bcmaps");
        assert!(set_bcmaps_dir(&missing).is_err());
    }

    #[test]
    fn set_bcmaps_dir_points_library_at_the_dir() {
        let dir = std::path::Path::new(env!("CARGO_MANIFEST_DIR")).join("resources/bcmaps");
        set_bcmaps_dir(&dir).expect("실재하는 bcmap 디렉터리는 받아들여야 한다");
        assert_eq!(
            std::env::var("PDF_INSPECTOR_BCMAPS_DIR").unwrap(),
            dir.to_string_lossy()
        );
    }

    /// 서드파티 파서에 PDF 가 아닌 바이트를 물려도 크래시가 아니라 AppError 여야 한다.
    #[test]
    fn non_pdf_bytes_return_err_not_panic() {
        let path = std::env::temp_dir().join("piecepool-pie74-not-a.pdf");
        std::fs::write(&path, "이건 PDF 가 아니다").unwrap();
        let r = extract(&path);
        let _ = std::fs::remove_file(&path);
        assert!(r.is_err(), "비 PDF 는 크래시 대신 Err 로 처리돼야 한다");
    }
}
