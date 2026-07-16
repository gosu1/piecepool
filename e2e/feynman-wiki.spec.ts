import { test, expect, type Page } from "@playwright/test";

// 위키 파인만 — LLM 이 만든 개념 문서를 자기 말로 설명하게 하고,
// 그 사고 과정을 위키 .md 본문의 `## 파인만 기록` 에 남긴다.

const chat = (payload: unknown) => ({
  status: 200,
  contentType: "application/json",
  body: JSON.stringify({ choices: [{ message: { content: JSON.stringify(payload) } }] }),
});

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem("gemini-key", "test-key");
    localStorage.removeItem("pp-feynman-dismissed");
  });
  await page.route("**generativelanguage.googleapis.com**", (route) =>
    route.fulfill(chat({ probe: "실행 중이라는 게 정확히 무슨 뜻인가요?", targetGap: "term" })),
  );
  await page.goto("/");
  await expect(page.getByRole("button", { name: "프로세스", exact: true })).toBeVisible();
});

/** seed 가 만든 위키 개념 문서를 연다. 본문 안 위키링크·관계 칩도 같은 이름의 버튼이라
 *  role 만으로는 모호하다(다른 위키에서 "프로세스"/"스레드" 를 보고 있을 때 특히) —
 *  사이드바(complementary)로 범위를 좁힌다. */
const openWiki = (page: Page) =>
  page.getByRole("complementary").getByRole("button", { name: "프로세스", exact: true }).click();
const openThread = (page: Page) =>
  page.getByRole("complementary").getByRole("button", { name: "스레드", exact: true }).click();

/**
 * 다른 위키로 실제로 이동했는지 확인한다.
 *
 * 이 단언이 없으면 "재방문" 테스트가 거짓말이 된다 — 클릭이 조용히 no-op 이어도
 * "박스 없음"·"수동 버튼 있음" 은 안 떠난 페이지에서도 참이라 통과해버린다.
 * 위키 문서 제목은 heading 이 아니라 `aria-label="페이지 제목"` 인 입력 요소로 렌더되므로
 * 그 값으로 도착을 확인한다.
 */
async function goElsewhere(page: Page) {
  await openThread(page);
  await expect(page.getByRole("textbox", { name: "페이지 제목" })).toHaveValue("스레드");
}

const box = (page: Page) => page.getByRole("textbox", { name: "개념 설명" });

/** 설명 한 번 + 되물음 + 판정까지. */
async function runSession(page: Page, said: string) {
  await box(page).fill(said);
  await page.getByRole("button", { name: "설명 보내기" }).click();
  await expect(page.getByText("실행 중이라는 게 정확히 무슨 뜻인가요?")).toBeVisible();
  await page.getByRole("button", { name: "네, 이해했어요" }).click();
}

test("기록 없는 위키를 열면 파인만이 자동으로 열린다", async ({ page }) => {
  await openWiki(page);
  await expect(box(page)).toBeVisible();
});

test("설명 → 되물음 → 판정 → 접힌 카드로 남고, 펼치면 대화 전문이 보인다", async ({ page }) => {
  await openWiki(page);
  await runSession(page, "프로세스는 실행 중인 프로그램이에요");

  // 대화창은 닫히고 카드가 생긴다
  await expect(box(page)).toHaveCount(0);
  const card = page.getByRole("button", { name: /이해함/ });
  await expect(card).toBeVisible();

  // 판정 직후에는 배지가 없다 — 뜨면 bodyHash 배선이 틀린 것이다(updatedAt 설계로 회귀)
  await expect(page.getByText("이후 문서가 바뀌었어요")).toHaveCount(0);

  await card.click();
  await expect(page.getByText("프로세스는 실행 중인 프로그램이에요")).toBeVisible();
  await expect(page.getByText("실행 중이라는 게 정확히 무슨 뜻인가요?")).toBeVisible();
});

test("위키 본문에 기록 원문이 노출되지 않는다", async ({ page }) => {
  await openWiki(page);
  await runSession(page, "프로세스는 실행 중인 프로그램이에요");
  // 본문 렌더에 `## 파인만 기록` 헤딩이 찍히면 패널과 이중 노출이다
  await expect(page.getByRole("heading", { name: "파인만 기록" })).toHaveCount(0);
});

test("[나중에] 를 누르면 재방문해도 자동으로 안 열린다", async ({ page }) => {
  await openWiki(page);
  await page.getByRole("button", { name: "나중에" }).click();
  await expect(box(page)).toHaveCount(0);

  // 다른 문서로 갔다가 돌아온다 — DocView 인스턴스가 재사용되는 경로
  await goElsewhere(page);
  await openWiki(page);
  await expect(box(page)).toHaveCount(0);
  // 대신 수동 버튼이 있다
  await expect(page.getByRole("button", { name: "이 개념을 설명해보기" })).toBeVisible();
});

test("진행 중인 세션은 다른 위키를 열어도 파괴되지 않는다", async ({ page }) => {
  await openWiki(page);
  await box(page).fill("쓰다 만 설명");
  await page.getByRole("button", { name: "설명 보내기" }).click();
  await expect(page.getByText("실행 중이라는 게 정확히 무슨 뜻인가요?")).toBeVisible();

  // 다른 위키로 갔다 온다 — 자동 열기가 이 세션을 덮으면 안 된다
  await goElsewhere(page);
  await openWiki(page);
  await expect(page.getByText("쓰다 만 설명")).toBeVisible();
});
