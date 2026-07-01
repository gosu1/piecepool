import { test, expect } from "@playwright/test";

// GOAL §J e2e — 브라우저 mock 대상 핵심 UI 플로우. 백엔드는 cargo integration 이 커버.

test.beforeEach(async ({ page }) => {
  await page.goto("/");
  // 부팅(seed) 완료 대기
  await expect(page.getByRole("button", { name: "Wiki" })).toBeVisible();
});

test("부팅 + 시드 위키가 보인다", async ({ page }) => {
  // 위키 리스트에 프로세스가 있다 (마스터-디테일)
  await expect(page.getByText("LLM 개념 위키")).toBeVisible();
  await expect(page.getByText("실행 중인 프로그램의 인스턴스").first()).toBeVisible();
});

test("섹션 네비게이션 — Graph 는 타입드 그래프 + 필터 칩", async ({ page }) => {
  await page.getByRole("button", { name: "Graph" }).click();
  await expect(page.getByText("타입 있는 개념 그래프")).toBeVisible();
  // RelationType 필터 칩
  await expect(page.getByRole("button", { name: "part_of" })).toBeVisible();
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
  // 프로세스 본문의 [[스레드]] 위키링크(본문 전용 클래스) 클릭 → 스레드 위키로 이동
  await page.locator("button.underline-offset-2", { hasText: "스레드" }).first().click();
  await expect(page.getByText(/코드·데이터·힙을 공유/)).toBeVisible();
});

test("Import 머신 — Inbox 저장 후 완료 파이프라인", async ({ page }) => {
  await page.getByRole("button", { name: "Inbox" }).click();
  await page.getByPlaceholder("제목").fill("e2e 노트");
  await page.getByPlaceholder(/마크다운/).fill("# e2e\n\n간단한 본문. 시간 복잡도는 O(n).");
  await page.getByRole("button", { name: /AI 정리/ }).click();
  // 상태머신이 완료까지 진행
  await expect(page.getByText("완료", { exact: false }).first()).toBeVisible();
});

test("설정 모달 — API 키 필드", async ({ page }) => {
  await page.getByRole("button", { name: /Admin/ }).click();
  await page.getByRole("button", { name: "설정", exact: true }).click();
  await expect(page.getByText("OpenAI API Key")).toBeVisible();
});
