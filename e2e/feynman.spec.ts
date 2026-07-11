import { test, expect } from "@playwright/test";

// 복습 표시(review_needed) — "이건 아직 모르겠다" 는 판단은 언제나 사용자가 한다.
// LLM 은 이 표시를 만들지도 지우지도 못한다(relation-types.md §review_needed).
//
// 파인만 자체(설명 → 되물음 루프)는 e2e/feynman-sections.spec.ts 가 검증한다.

test.beforeEach(async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("button", { name: "프로세스", exact: true })).toBeVisible();
});

/** 그래프에서 개념 하나를 골라 "아직 모르겠다" 고 표시한다. 이유가 곧 근거(evidence ≥ 1). */
async function markOnGraph(page: import("@playwright/test").Page, concept: string, reason: string) {
  await page.getByRole("button", { name: "Graph" }).click();
  await expect(page.getByText("타입 있는 개념 그래프")).toBeVisible();
  const help = page.getByRole("button", { name: "도움말 닫기" });
  if (await help.isVisible().catch(() => false)) await help.click();

  // 노드는 Cytoscape 캔버스라 DOM 클릭이 안 된다 — "개념 찾기" 로 선택한다(pickMatch).
  const search = page.getByPlaceholder("개념 찾기…");
  await search.fill(concept);
  await search.locator("xpath=following-sibling::div").getByRole("button", { name: concept, exact: true }).click();

  await page.getByRole("button", { name: "아직 모르겠다고 표시" }).click();
  await page.getByPlaceholder(/왜 그렇게 되는지/).fill(reason);
  await page.getByRole("button", { name: "표시", exact: true }).click();
}

test("사용자가 그래프에서 직접 표시한다 (판단은 언제나 사용자)", async ({ page }) => {
  await markOnGraph(page, "교착상태", "네 조건이 왜 동시에 필요한지 모르겠어요");
  await expect(page.getByText(/"교착상태" 을\(를\) 복습 필요로 표시했어요/)).toBeVisible({ timeout: 15000 });
  await expect(page.getByRole("button", { name: "복습" })).toBeVisible();
});

test("표시 → 해제 → 재표시 왕복 — 사용자가 붙이고 사용자가 거둔다", async ({ page }) => {
  await markOnGraph(page, "동기화", "왜 임계 구역을 지켜야 하는지 설명을 못 하겠어요");
  await expect(page.getByRole("button", { name: "복습" })).toBeVisible({ timeout: 15000 });
  await expect(page.getByText("아직 모르겠다고 표시한 개념")).toBeVisible();

  await page.getByRole("button", { name: "표시 해제" }).click();
  await expect(page.getByText(/복습 표시를 해제했어요/)).toBeVisible({ timeout: 15000 });
  // 관계가 사라졌으므로 복습 그룹 칩도 사라진다
  await expect(page.getByRole("button", { name: "복습" })).toHaveCount(0);
  await expect(page.getByText("아직 모르겠다고 표시한 개념")).toHaveCount(0);

  // 해제 후 다시 표시할 수 있다 — 시연 촬영을 반복하려면 왕복이 성립해야 한다.
  await page.getByRole("button", { name: "아직 모르겠다고 표시" }).click();
  await page.getByPlaceholder(/왜 그렇게 되는지/).fill("역시 아직 모르겠어요");
  await page.getByRole("button", { name: "표시", exact: true }).click();
  await expect(page.getByRole("button", { name: "복습" })).toBeVisible({ timeout: 15000 });
  await expect(page.getByText("아직 모르겠다고 표시한 개념")).toBeVisible();
});

test("노트 하단 플로팅 바 — 이 노트에서 나온 개념 중 표시된 것을 먼저 알린다", async ({ page }) => {
  await markOnGraph(page, "동기화", "임계 구역의 의미를 모르겠어요");
  await expect(page.getByRole("button", { name: "복습" })).toBeVisible({ timeout: 15000 });

  // 그 개념이 나온 원본 노트를 연다 → 바가 먼저 말을 건다
  await page.getByRole("complementary").getByRole("button", { name: /운영체제 개요/ }).click();
  await expect(page.getByText(/이 노트의 개념 하나를 아직 모르겠다고 표시하셨어요/)).toBeVisible();

  // 개념 칩을 누르면 그 위키가 열린다
  await page.getByRole("button", { name: "동기화", exact: true }).last().click();
  await expect(page.getByRole("tab", { name: /동기화/ })).toBeVisible();
});
