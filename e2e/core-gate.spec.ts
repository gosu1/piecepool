import { test, expect } from "@playwright/test";

// 핵심 주제 게이트 — Gemini 가 "모르면 나머지가 무너지는" 섹션을 가리고,
// 그 주제는 사용자가 파인만에 답하고 "이해했다" 고 해야 위키가 된다.
// 노트(archive)는 언제나 저장된다 — 막는 것은 위키뿐이다.

const NOTE = `# Transformer

## 어텐션
쿼리와 키의 유사도로 가중치를 만든다.

## 참고 문헌
Vaswani et al., 2017.`;

const chat = (payload: unknown) => ({
  status: 200,
  contentType: "application/json",
  body: JSON.stringify({ choices: [{ message: { content: JSON.stringify(payload) } }] }),
});

const CONCEPTS = {
  concepts: [{ title: "어텐션", summary: "요약", explanation: "설명", examples: [], sourceRefs: [], sourceEmbeds: [] }],
  relations: [],
};

/** 시스템 프롬프트로 어떤 호출인지 구분한다 — 핵심 판별 / 파인만 되물음 / 위키 생성. */
async function routeGemini(page: import("@playwright/test").Page, core: { id: number; isCore: boolean }[]) {
  await page.route("**generativelanguage.googleapis.com**", (route) => {
    const body = route.request().postData() ?? "";
    if (body.includes("핵심 주제")) return route.fulfill(chat({ sections: core }));
    if (body.includes("Feynman-technique")) return route.fulfill(chat({ probe: "왜 그런가요?", targetGap: "why" }));
    return route.fulfill(chat(CONCEPTS));
  });
}

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem("gemini-key", "test-key");
    localStorage.removeItem("pp-feynman-sections");
  });
  await page.goto("/");
  await expect(page.getByRole("button", { name: "프로세스", exact: true })).toBeVisible();
});

/** 원본 노트를 열고 NOTE 로 채워 저장한다(게이트는 저장된 노트에 걸린다). */
async function openSavedNote(page: import("@playwright/test").Page) {
  await page.getByText("운영체제 개요 강의 노트", { exact: false }).first().click();
  await page.getByRole("button", { name: "편집" }).click();
  const editor = page.locator(".cm-content").first();
  await editor.click();
  await page.keyboard.press("ControlOrMeta+a");
  await page.keyboard.press("Backspace");
  await editor.pressSequentially(NOTE);
  await page.getByRole("button", { name: "저장", exact: true }).click();
  await page.getByRole("button", { name: "편집" }).click(); // 다시 편집 모드(파인만 핸들이 여기 있다)
}

test("핵심 주제를 설명하지 않으면 위키 생성이 막히고, 어느 주제가 막는지 알려준다", async ({ page }) => {
  await routeGemini(page, [{ id: 0, isCore: true }, { id: 1, isCore: false }]);
  await openSavedNote(page);

  await page.getByRole("button", { name: /AI 위키 생성/ }).click();
  // 토스트는 4초 뒤 사라진다 → 상태줄에도 남긴다. 둘 다 어느 주제가 막는지 말해준다.
  await expect(page.getByRole("contentinfo").getByText(/핵심 주제를 먼저 설명해보세요/)).toBeVisible({ timeout: 20000 });
  await expect(page.getByRole("main").getByText(/핵심 주제를 먼저 설명해보세요 — "어텐션"/)).toBeVisible();
});

test("핵심 주제에 답하고 [이해했어요] 하면 게이트가 열리고, 그 설명이 위키에 반영된다", async ({ page }) => {
  await routeGemini(page, [{ id: 0, isCore: true }, { id: 1, isCore: false }]);
  await openSavedNote(page);

  // 제목 호버 → 파인만
  const heading = page.locator(".cm-line", { hasText: "어텐션" }).first();
  await heading.hover();
  await heading.locator(".pp-heading-action").click();
  await page.getByLabel("주제 설명").fill("유사도가 높은 값을 더 많이 섞어요");
  await page.getByRole("button", { name: "설명 보내기" }).click();
  await expect(page.getByText(/왜 그런가요/)).toBeVisible({ timeout: 20000 });

  // [네, 이해했어요] → 그 섹션 위키가 사용자의 설명으로 다시 쓰인다
  await page.getByRole("button", { name: "네, 이해했어요" }).click();
  await expect(page.getByText(/"어텐션" 이해를 위키에 반영했어요/)).toBeVisible({ timeout: 30000 });

  // 이제 위키 생성이 열린다
  await page.getByRole("button", { name: /AI 위키 생성/ }).click();
  await expect(page.getByRole("contentinfo").getByText(/핵심 주제를 먼저 설명해보세요/)).toHaveCount(0);
});

test("핵심 주제가 없으면 막지 않는다", async ({ page }) => {
  await routeGemini(page, [{ id: 0, isCore: false }, { id: 1, isCore: false }]);
  await openSavedNote(page);

  await page.getByRole("button", { name: /AI 위키 생성/ }).click();
  await expect(page.getByRole("contentinfo").getByText(/핵심 주제를 먼저 설명해보세요/)).toHaveCount(0);
});

test("키가 없으면 게이트를 걸지 않는다 — 판정을 못 받았을 뿐 사람을 잘못 막지 않는다", async ({ page }) => {
  await page.addInitScript(() => localStorage.removeItem("gemini-key"));
  await page.reload();
  await openSavedNote(page);

  await page.getByRole("button", { name: /AI 위키 생성/ }).click();
  await expect(page.getByRole("contentinfo").getByText(/핵심 주제를 먼저 설명해보세요/)).toHaveCount(0);
});

test("정리 글 변환도 위키다 — 같은 게이트가 막는다", async ({ page }) => {
  await routeGemini(page, [{ id: 0, isCore: true }, { id: 1, isCore: false }]);
  await openSavedNote(page);
  await page.getByRole("button", { name: "읽기" }).click();

  await page.getByRole("button", { name: /정리 글 변환/ }).click();
  await expect(page.getByRole("contentinfo").getByText(/핵심 주제를 먼저 설명해보세요/)).toBeVisible({ timeout: 20000 });
});
