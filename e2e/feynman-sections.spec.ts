import { test, expect } from "@playwright/test";

// 섹션 파인만 — 노트 에디터에서 ##/### 을 드래그하면 선택 위에 버튼이 뜨고,
// 그 섹션(+하위 소주제)을 하나씩 자기 말로 설명하게 한다. 노트 본문은 절대 변하지 않는다.

const NOTE = `# Transformer

## attention
쿼리와 키의 유사도로 가중치를 만든다.

### scaled dot-product
내적을 √dk 로 나눈다.

### multi-head
헤드를 여러 개 둔다.

## 임베딩
토큰을 벡터로 바꾼다.`;

const chat = (payload: unknown) => ({
  status: 200,
  contentType: "application/json",
  body: JSON.stringify({ choices: [{ message: { content: JSON.stringify(payload) } }] }),
});

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem("gemini-key", "test-key");
    localStorage.removeItem("pp-feynman-sections");
  });
  await page.route("**generativelanguage.googleapis.com**", (route) =>
    route.fulfill(chat({ probe: "유사도가 크면 왜 더 많이 섞나요?", targetGap: "why" })),
  );
  await page.goto("/");
  await expect(page.getByRole("button", { name: "프로세스", exact: true })).toBeVisible();
});

/** 원본 노트를 열고 편집 모드에서 본문을 NOTE 로 채운다. */
async function openNote(page: import("@playwright/test").Page) {
  await page.getByText("운영체제 개요 강의 노트", { exact: false }).first().click();
  await page.getByRole("button", { name: "편집" }).click();
  const editor = page.locator(".cm-content").first();
  await editor.click();
  await page.keyboard.press("ControlOrMeta+a");
  await page.keyboard.press("Backspace");
  await editor.pressSequentially(NOTE);
  return editor;
}

/** 그 줄을 마우스로 실제 드래그해 선택한다. */
async function dragLine(page: import("@playwright/test").Page, text: string) {
  const line = page.locator(".cm-line", { hasText: text }).first();
  const b = (await line.boundingBox())!;
  await page.mouse.move(b.x + 4, b.y + b.height / 2);
  await page.mouse.down();
  await page.mouse.move(b.x + b.width - 8, b.y + b.height / 2, { steps: 10 });
  await page.mouse.up();
}

test("## 을 드래그하면 자신 + 하위 ### 이 순차 주제가 된다", async ({ page }) => {
  await openNote(page);
  await dragLine(page, "attention");

  // 우클릭을 찾아 헤매지 않는다 — 선택 위에 바로 뜬다
  const btn = page.getByRole("button", { name: /파인만/ });
  await expect(btn).toHaveText(/주제 3개/);
  await btn.click();

  await expect(page.getByText("주제 1/3")).toBeVisible();
  await expect(page.getByText(/attention.*처음 배우는 사람에게 설명해보세요/)).toBeVisible();

  // 설명 없이는 판정할 수 없다 — 근거 없는 "이해했다" 를 막는다
  await expect(page.getByRole("button", { name: "네, 이해했어요" })).toBeDisabled();

  await page.getByLabel("주제 설명").fill("유사도가 높은 값을 더 많이 반영해요");
  await page.getByRole("button", { name: "설명 보내기" }).click();
  await expect(page.getByText(/유사도가 크면 왜 더 많이 섞나요/)).toBeVisible({ timeout: 20000 });

  // 판정 → 다음 주제로. 입력창은 비어 있어야 한다(앞 주제의 설명이 따라오면 안 된다).
  await page.getByRole("button", { name: "네, 이해했어요" }).click();
  await expect(page.getByText("주제 2/3")).toBeVisible();
  await expect(page.getByText(/scaled dot-product.*처음 배우는 사람에게/)).toBeVisible();
  await expect(page.getByLabel("주제 설명")).toHaveValue("");
});

test("소주제만 드래그하면 그 소주제 하나만 대상이다", async ({ page }) => {
  await openNote(page);
  await dragLine(page, "헤드를 여러 개 둔다");
  await expect(page.getByRole("button", { name: /파인만/ })).toHaveText(/multi-head/);
});

test("헤딩을 건드리지 않은 선택에는 버튼이 뜨지 않는다", async ({ page }) => {
  const editor = await openNote(page);
  // 첫 줄(H1) 은 주제가 아니다
  await dragLine(page, "Transformer");
  await expect(page.getByRole("button", { name: /파인만/ })).toHaveCount(0);
  await expect(editor).toBeVisible();
});

test("되물음이 실패해도 설명은 보존된다 — 재타이핑 없이 [다시 시도]", async ({ page }) => {
  await page.unroute("**generativelanguage.googleapis.com**");
  let fail = true;
  await page.route("**generativelanguage.googleapis.com**", (route) =>
    fail ? route.fulfill({ status: 503, body: "" }) : route.fulfill(chat({ probe: "왜 그런가요?", targetGap: "why" })),
  );

  await openNote(page);
  await dragLine(page, "attention");
  await page.getByRole("button", { name: /파인만/ }).click();
  await page.getByLabel("주제 설명").fill("애써 쓴 내 설명");
  await page.getByRole("button", { name: "설명 보내기" }).click();

  await expect(page.getByText(/파인만 질문을 못 만들었어요/)).toBeVisible({ timeout: 20000 });
  await expect(page.getByText("나: 애써 쓴 내 설명")).toBeVisible(); // 설명은 그대로 있다

  fail = false;
  await page.getByRole("button", { name: "다시 시도" }).click();
  await expect(page.getByText(/왜 그런가요/)).toBeVisible({ timeout: 20000 });
});

test("인박스: [파인만] 은 토글이 아니라 글 전체를 대상으로 하는 액션이다", async ({ page }) => {
  await page.getByRole("button", { name: "새 노트 작성" }).click();
  await page.getByPlaceholder("새 페이지").fill("트랜스포머 정리");
  await page.locator(".cm-content").first().click();
  await page.keyboard.type(NOTE);

  await page.getByRole("button", { name: "파인만", exact: true }).click();

  // 헤딩이 있는 글이므로 모든 섹션이 순차 주제가 된다
  await expect(page.getByText("주제 1/4")).toBeVisible();
  await expect(page.getByText(/attention.*처음 배우는 사람에게/)).toBeVisible();
});

test("인박스에서 한 파인만의 설명은 저장 시 위키 재료가 된다", async ({ page }) => {
  await page.getByRole("button", { name: "새 노트 작성" }).click();
  await page.getByPlaceholder("새 페이지").fill("트랜스포머 정리");
  await page.locator(".cm-content").first().click();
  await page.keyboard.type(NOTE);

  await page.getByRole("button", { name: "파인만", exact: true }).click();
  await page.getByLabel("주제 설명").fill("유사도로 가중치를 만들어 값을 섞어요");
  await page.getByRole("button", { name: "설명 보내기" }).click();
  await expect(page.getByText(/유사도가 크면/)).toBeVisible({ timeout: 20000 });
  await page.getByRole("button", { name: "네, 이해했어요" }).click();

  // 저장 → 초안(inbox:*) 판정이 진짜 노트로 옮겨지고, 설명이 위키 생성 재료로 들어간다
  await page.getByRole("button", { name: /저장 \+ AI 정리/ }).click();
  await expect(page.getByText(/파인만에서 쓴 설명을 위키 정리에 함께 넣었어요/)).toBeVisible({ timeout: 30000 });

  const saved = await page.evaluate(() => localStorage.getItem("pp-feynman-sections"));
  expect(saved).not.toContain("inbox:"); // 초안 키는 남지 않는다
  expect(saved).toContain("attention");
});

test("판정은 localStorage 에 남고, 노트 본문은 변하지 않는다", async ({ page }) => {
  await openNote(page);
  await dragLine(page, "토큰을 벡터로");
  await page.getByRole("button", { name: /파인만/ }).click();
  await page.getByLabel("주제 설명").fill("각 토큰을 고정 길이 벡터로 매핑해요");
  await page.getByRole("button", { name: "설명 보내기" }).click();
  await expect(page.getByText(/유사도가 크면/)).toBeVisible({ timeout: 20000 });
  await page.getByRole("button", { name: "아직 모르겠어요" }).click();

  const saved = await page.evaluate(() => localStorage.getItem("pp-feynman-sections"));
  expect(saved).toContain("임베딩");
  expect(JSON.parse(saved!).state.statuses).toMatchObject({
    [`source-os-overview::임베딩`]: { answered: true, understood: false },
  });

  // 파인만은 노트를 고치지 않는다 — 저장하지 않았으므로 원문 그대로다
  await page.getByRole("button", { name: "읽기" }).click();
  await expect(page.getByText(/임계 구역|프로세스/).first()).toBeVisible();
});
