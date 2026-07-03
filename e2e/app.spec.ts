import { test, expect } from "@playwright/test";

// GOAL §J e2e — 브라우저 mock 대상 핵심 UI 플로우. 백엔드는 cargo integration 이 커버.
// 부팅 탭-0 = Study Home. 문서는 좌측 파일 트리에서 연다.

test.beforeEach(async ({ page }) => {
  await page.goto("/");
  // 부팅(seed) 완료 대기 — 트리에 시드 위키가 뜬다
  await expect(page.getByRole("button", { name: "프로세스" })).toBeVisible();
});

test("부팅 → Study Home + 트리에서 위키 열기", async ({ page }) => {
  await expect(page.getByText("Study Home").first()).toBeVisible();
  await page.getByRole("button", { name: "프로세스" }).click();
  await expect(page.getByText("실행 중인 프로그램의 인스턴스").first()).toBeVisible();
});

test("섹션 네비게이션 — Graph 는 그룹 칩 + 계층 토글 + 읽는 법 + 컨트롤", async ({ page }) => {
  await page.getByRole("button", { name: "Graph" }).click();
  await expect(page.getByText("타입 있는 개념 그래프")).toBeVisible();
  // 관계 그룹 필터 칩(한국어) + 계층 토글 + 그래프 컨트롤(맞춤/재배치)
  await expect(page.getByRole("button", { name: "구조·순서" })).toBeVisible();
  await expect(page.getByRole("button", { name: "계층 보기" })).toBeVisible();
  await expect(page.getByRole("button", { name: "화면 맞춤" })).toBeVisible();
  // 첫 방문 → "그래프 읽는 법" 자동 펼침, 닫으면 ? 버튼으로
  await expect(page.getByText("그래프 읽는 법")).toBeVisible();
  await page.getByRole("button", { name: "도움말 닫기" }).click();
  await expect(page.getByRole("button", { name: "그래프 읽는 법" })).toBeVisible();
});

test("⌘K 검색 — 본문 매치(임계 → 동기화)", async ({ page }) => {
  await page.keyboard.press("Meta+k");
  const input = page.getByPlaceholder(/검색/);
  await expect(input).toBeVisible();
  await input.fill("임계"); // 제목엔 없고 동기화 본문에만
  await expect(page.getByText("동기화").first()).toBeVisible();
  await expect(page.getByText(/임계 구역/)).toBeVisible(); // 스니펫
});

test("위키링크 클릭 → 다른 위키로 이동", async ({ page }) => {
  await page.getByRole("button", { name: "프로세스" }).click();
  // 프로세스 본문의 [[스레드]] 위키링크(본문 전용 클래스) 클릭 → 스레드 위키로 이동
  await page.locator("button.underline-offset-2", { hasText: "스레드" }).first().click();
  await expect(page.getByText(/코드·데이터·힙을 공유/)).toBeVisible();
});

test("Import 머신 — Inbox 저장 후 완료 파이프라인", async ({ page }) => {
  await page.getByRole("button", { name: "새 노트 (Inbox)" }).click();
  await page.getByPlaceholder("제목").fill("e2e 노트");
  await page.locator(".cm-content").click();
  await page.keyboard.type("# e2e — 간단한 본문. 시간 복잡도는 O(n).");
  await page.getByRole("button", { name: /AI 정리/ }).click();
  // 상태머신이 완료까지 진행
  await expect(page.getByText("완료", { exact: false }).first()).toBeVisible();
});

test("Inbox 패널 — 노트 고정, PDF·위키 보조 패널 여닫기", async ({ page }) => {
  await page.getByRole("button", { name: "새 노트 (Inbox)" }).click();
  // 기본: 노트 에디터만 (보조 패널 닫힘)
  await expect(page.getByPlaceholder("제목")).toBeVisible();
  await expect(page.getByText("PDF", { exact: true })).not.toBeVisible();
  // PDF 패널 열고 닫기
  await page.getByRole("button", { name: "PDF 패널" }).click();
  await expect(page.getByText("PDF", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "PDF 패널" }).click();
  await expect(page.getByText("PDF", { exact: true })).not.toBeVisible();
  // 위키 패널 열고 닫기 — 노트 에디터는 그대로
  await page.getByRole("button", { name: "위키 패널" }).click();
  await expect(page.getByText("위키", { exact: true })).toBeVisible();
  await expect(page.getByPlaceholder("제목")).toBeVisible();
  await page.getByRole("button", { name: "위키 패널" }).click();
  await expect(page.getByText("위키", { exact: true })).not.toBeVisible();
});

test("사이드바 리사이즈 — 핸들 드래그로 폭 변경", async ({ page }) => {
  const aside = page.locator("aside");
  const before = (await aside.boundingBox())!.width;
  const handle = page.getByRole("separator", { name: "사이드바 폭 조절" });
  const hb = (await handle.boundingBox())!;
  await page.mouse.move(hb.x + hb.width / 2, hb.y + 200);
  await page.mouse.down();
  await page.mouse.move(hb.x + hb.width / 2 + 100, hb.y + 200);
  await page.mouse.up();
  const after = (await aside.boundingBox())!.width;
  expect(after).toBeGreaterThan(before + 60);
});

test("트리 컨텍스트 메뉴 — 원본 이름 변경", async ({ page }) => {
  const note = page.getByRole("button", { name: "운영체제 개요 강의 노트" });
  await note.click({ button: "right" });
  await page.getByRole("button", { name: "이름 변경…" }).click();
  await page.getByPlaceholder("새 제목").fill("OS 개요 노트 (수정)");
  await page.getByRole("button", { name: "저장" }).click();
  await expect(page.getByRole("button", { name: "OS 개요 노트 (수정)" })).toBeVisible();
});

test("설정 모달 — API 키 + 테마 설정", async ({ page }) => {
  // 리본의 설정 아이콘과 구분 — 사이드바 하단 볼트바의 설정 기어
  await page.getByRole("complementary").getByRole("button", { name: "설정", exact: true }).click();
  await expect(page.getByText("OpenAI API Key")).toBeVisible();
  await expect(page.getByText("테마")).toBeVisible();
});

test("새 탭(+) → '제목 없음' 노트 생성 후 편집 탭으로 열림", async ({ page }) => {
  await page.getByRole("button", { name: "새 탭" }).click();
  // 새 노트가 만들어지고 편집 탭 활성 + 트리에도 등장
  await expect(page.getByRole("tab", { name: /제목 없음/ })).toBeVisible();
  await expect(page.getByRole("complementary").getByRole("button", { name: "제목 없음" })).toBeVisible();
});
