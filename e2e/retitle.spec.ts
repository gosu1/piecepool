import { test, expect } from "@playwright/test";

// 위키 제목 일괄 정리 — 공간 우클릭 → 제안 확인 → 선택 적용.
// 제안은 LLM(mock), rename 실행은 mockIpc.renameWiki — 실제 앱 경로 그대로.

const chat = (payload: unknown) => ({
  status: 200,
  contentType: "application/json",
  body: JSON.stringify({ choices: [{ message: { content: JSON.stringify(payload) } }] }),
});

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem("gemini-key", "test-key"));
  await page.route("**generativelanguage.googleapis.com**", (route) =>
    route.fulfill(
      (route.request().postData() ?? "").includes('"RetitleResult"')
        ? chat({
            changes: [
              { from: "프로세스", to: "Process" },
              { from: "스레드", to: "프로세스" }, // 기존 제목과 충돌 — 잠긴 행으로 떠야 한다
            ],
          })
        : chat({ probe: "왜요?", targetGap: "why" }),
    ),
  );
  await page.goto("/");
  await expect(page.getByRole("button", { name: "프로세스", exact: true })).toBeVisible();
});

test("공간 우클릭 → 제안 목록 → 충돌 행은 잠기고, 선택한 것만 일괄 변경된다", async ({ page }) => {
  const sidebar = page.getByRole("complementary");
  await sidebar.getByRole("button", { name: "운영체제", exact: true }).click({ button: "right" });
  await page.getByRole("button", { name: "위키 제목 정리…" }).click();

  // 제안 두 건 — 정상 행 + 충돌 행(기존 "프로세스" 와 겹침)
  await expect(page.getByText("Process")).toBeVisible();
  await expect(page.getByText("같은 제목이 이미 있어요 — 수동 병합 필요")).toBeVisible();

  // 충돌 행은 세지 않는다 — 적용 가능한 것은 1개뿐
  await page.getByRole("button", { name: "1개 적용" }).click();

  await expect(page.getByText("위키 제목 1개 변경됨")).toBeVisible();
  await expect(sidebar.getByRole("button", { name: "Process", exact: true })).toBeVisible();
  // 스레드는 충돌로 잠겨 있었으니 그대로다
  await expect(sidebar.getByRole("button", { name: "스레드", exact: true })).toBeVisible();
});
