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

/** 되물음에 답한 뒤 판정 — 기록에 되물음이 남는 유일한 흐름이다(끝 되물음은 트림된다). */
async function runAnsweredSession(page: Page, said: string, answer: string) {
  await box(page).fill(said);
  await page.getByRole("button", { name: "설명 보내기" }).click();
  await expect(page.getByText("실행 중이라는 게 정확히 무슨 뜻인가요?")).toBeVisible();
  await box(page).fill(answer);
  await page.getByRole("button", { name: "다시 설명" }).click();
  await page.getByRole("button", { name: "네, 이해했어요" }).click();
}

test("기록 없는 위키를 열면 파인만이 자동으로 열린다", async ({ page }) => {
  await openWiki(page);
  await expect(box(page)).toBeVisible();
});

test("설명 → 되물음 → 답변 → 판정 → 접힌 카드로 남고, 펼치면 대화 전문이 보인다", async ({ page }) => {
  await openWiki(page);
  await runAnsweredSession(page, "프로세스는 실행 중인 프로그램이에요", "메모리에 올라가서 CPU 를 받는 상태요");

  // 대화창은 닫히고 카드가 생긴다
  await expect(box(page)).toHaveCount(0);
  const card = page.getByRole("button", { name: /이해함/ });
  await expect(card).toBeVisible();

  // 판정 직후에는 배지가 없다 — 뜨면 bodyHash 배선이 틀린 것이다(updatedAt 설계로 회귀)
  await expect(page.getByText("이후 문서가 바뀌었어요")).toHaveCount(0);

  await card.click();
  await expect(page.getByText("프로세스는 실행 중인 프로그램이에요")).toBeVisible();
  await expect(page.getByText("실행 중이라는 게 정확히 무슨 뜻인가요?")).toBeVisible();
  await expect(page.getByText("메모리에 올라가서 CPU 를 받는 상태요")).toBeVisible();
});

test("기록은 내 답변으로 끝난다 — 답 없이 매달린 되물음은 안 남는다", async ({ page }) => {
  // 되물음 직후 바로 판정하는 흐름. 그 되물음은 답이 없으니 기록에 안 남아야 한다.
  await openWiki(page);
  await runSession(page, "프로세스는 실행 중인 프로그램이에요");
  await page.getByRole("button", { name: /이해함/ }).click();
  await expect(page.getByText("프로세스는 실행 중인 프로그램이에요")).toBeVisible();
  await expect(page.getByText("실행 중이라는 게 정확히 무슨 뜻인가요?")).toHaveCount(0);
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

// ── Task 10: 인박스 위키 참조 패널에도 파인만 (수동 전용) ──────────────────────────

/** 인박스 탭을 새로 열고 → 위키 패널을 켜고 → 목록에서 개념을 고른다.
 *  "이 공간의 개념" 목록(잡 없이 공간 전체 브라우징 시)은 refCandidates 에서
 *  isSynthesisPage 를 걸러낸 것이라, 시드 위키(프로세스 등)는 항상 여기로 뜬다. */
async function openInboxWiki(page: Page, title: string) {
  await page.getByRole("button", { name: "새 노트 작성" }).click();
  await page.getByRole("button", { name: "위키 패널", exact: true }).click();
  await page
    .locator("text=이 공간의 개념")
    .locator("xpath=following-sibling::ul[1]")
    .getByRole("button", { name: title, exact: true })
    .click();
}

test("인박스 위키 패널 — 수동 버튼으로 시작하고 판정하면 카드가 남는다", async ({ page }) => {
  await openInboxWiki(page, "프로세스");
  // 인박스는 자동으로 안 열린다 — 노트 쓰는 중에 방해하지 않는다
  await expect(box(page)).toHaveCount(0);
  await page.getByRole("button", { name: "이 개념을 설명해보기" }).click();
  await box(page).fill("프로세스는 실행 중인 프로그램이에요");
  await page.getByRole("button", { name: "설명 보내기" }).click();
  await expect(page.getByText("실행 중이라는 게 정확히 무슨 뜻인가요?")).toBeVisible();
  await page.getByRole("button", { name: "네, 이해했어요" }).click();
  // onWikiSaved 가 없으면 여기서 카드가 안 나타난다(wikiBySlug 사본이 stale 로 남아 refWiki 가 안 바뀜)
  await expect(page.getByRole("button", { name: /이해함/ })).toBeVisible();
});

/**
 * ⚠ 이건 정리 글(합성 페이지)이 아니라 isSynthesisPage 의 접두사 충돌이다("Syn X" → concept-syn-x).
 *
 * 진짜 정리 글(convertStore.runConvert 산출물)은 이 앱에 만드는 UI 진입점이 없을뿐더러,
 * 있다 해도 인박스 위키 패널의 선택 경로 셋(목록 refCandidates.filter(!isSynthesisPage) ·
 * 키워드 termTitles · jobWikiPaths)이 전부 isSynthesisPage 를 거르거나 애초에
 * concept-syn-* 를 만들 수 없어 "정리 글이 파인만에 안 뜬다" 는 이 경로로 테스트할 수 없다.
 * 여기서 실제로 걸리는 건 "SYN Flood" 같은 실재 개념이 정리 글로 오인되는 **버그**(후속 이슈,
 * conceptId 스킴 변경 + 마이그레이션 필요라 이 PR 범위 밖)다. 그 버그를 고치는 사람이
 * "정리 글엔 파인만이 없다" 라는 이름으로 이 테스트를 실패시켜 자신이 정리 글 처리를
 * 깼다고 오도되면 안 된다 — 버그가 고쳐지는 날 이 테스트는 **없어지는 게 맞다**
 * (가드의 진짜 목적은 그 시점에 이미 여기서 도달 불가하기 때문).
 */
test("인박스 위키 패널 — conceptId 가 concept-syn-* 인 페이지엔 파인만이 안 붙는다", async ({ page }) => {
  await page.route("**generativelanguage.googleapis.com**", (route) =>
    route.fulfill(
      chat({
        concepts: [
          { title: "Syn X", summary: "테스트용 합성 대역", explanation: "테스트용 합성 대역", examples: [], sourceRefs: [], sourceEmbeds: [] },
        ],
        relations: [],
      }),
    ),
  );
  await page.getByRole("button", { name: "새 노트 작성" }).click();
  await page.getByPlaceholder("새 페이지").fill("정리 글 가드 테스트");
  await page.locator(".cm-content").click();
  await page.keyboard.type("본문");
  await page.getByRole("button", { name: /AI 정리/ }).click();
  await expect(page.getByText("완료", { exact: false }).first()).toBeVisible();
  await page
    .locator("text=이 노트의 개념")
    .locator("xpath=following-sibling::ul[1]")
    .getByRole("button", { name: "Syn X", exact: true })
    .click();
  await expect(page.getByRole("button", { name: "이 개념을 설명해보기" })).toHaveCount(0);
});
