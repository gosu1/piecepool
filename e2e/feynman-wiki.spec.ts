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
  // 같은 엔드포인트로 되물음(Probe)·힌트(AnalogyHint)가 온다 — response_format 이름으로 가른다.
  await page.route("**generativelanguage.googleapis.com**", (route) =>
    route.fulfill(
      (route.request().postData() ?? "").includes('"AnalogyHint"')
        ? chat({ analogy: "프로세스를 요리사에 비유해보세요", questions: ["주방에는 왜 요리사가 있을까요?", "레시피는 누가 볼까요?"] })
        : chat({ probe: "실행 중이라는 게 정확히 무슨 뜻인가요?", targetGap: "term" }),
    ),
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

test("[아직 모르겠어요] 1단계는 비유 힌트만 — 기록은 [그래도 모르겠어요] 가 남긴다", async ({ page }) => {
  await openWiki(page);
  // 설명 전에도 눌린다 — 시작조차 못 하는 사람을 위한 버튼이다
  await page.getByRole("button", { name: "아직 모르겠어요" }).click();
  await expect(page.getByText(/요리사에 비유해보세요/)).toBeVisible();
  await expect(page.getByText("주방에는 왜 요리사가 있을까요?")).toBeVisible(); // 유도 질문
  // 아직 아무것도 기록되지 않았다 — 카드 없음
  await expect(page.getByRole("button", { name: /모르겠다고 표시/ })).toHaveCount(0);

  // 힌트를 보고도 모르면 그때 not_yet 으로 기록된다
  await page.getByRole("button", { name: "그래도 모르겠어요" }).click();
  await expect(box(page)).toHaveCount(0); // 세션 종료
  await expect(page.getByRole("button", { name: /모르겠다고 표시/ })).toBeVisible();
});

test("[닫기] 를 누르면 재방문해도 자동으로 안 열린다", async ({ page }) => {
  await openWiki(page);
  await page.getByRole("button", { name: "파인만 닫기" }).click();
  await expect(box(page)).toHaveCount(0);

  // 다른 문서로 갔다가 돌아온다 — DocView 인스턴스가 재사용되는 경로
  await goElsewhere(page);
  await openWiki(page);
  await expect(box(page)).toHaveCount(0);
  // 대신 수동 버튼이 있다
  await expect(page.getByRole("button", { name: "파인만 기능" })).toBeVisible();
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
/**
 * 이 노트에서 파생되지 **않은** 위키를 인박스 패널에 띄운다.
 *
 * 목록은 이제 이 노트에서 파생된 개념(sourceIds)만 보여주므로, 새 노트에선 비어 있다.
 * 남은 경로는 본문 키워드 클릭 하나뿐이다 — 다른 노트에서 나온 개념도 본문에 언급되면
 * 하이라이트되고 눌러서 볼 수 있다(상호참조).
 */
async function openInboxWiki(page: Page, title: string) {
  await page.getByRole("button", { name: "새 노트 작성" }).click();
  await page.locator(".cm-content").click();
  await page.keyboard.type(title);
  await page.locator(`.cm-wiki-term[data-wiki-term="${title}"]`).first().click();
}

/** 노트 하나를 "저장 + AI 정리" 로 임포트한다. 위키 패널은 개념 **목록**이 열린 채로 끝난다. */
async function importNote(page: Page, title: string, concept: string) {
  await page.route("**generativelanguage.googleapis.com**", (route) =>
    route.fulfill(
      chat({
        concepts: [
          { title: concept, summary: "요약", explanation: "설명", examples: [], sourceRefs: [], sourceEmbeds: [] },
        ],
        relations: [],
      }),
    ),
  );
  await page.getByRole("button", { name: "새 노트 작성" }).click();
  await page.getByPlaceholder("새 페이지").fill(title);
  await page.locator(".cm-content").click();
  await page.keyboard.type("본문");
  await page.getByRole("button", { name: /AI 정리/ }).click();
  await expect(page.getByText("완료", { exact: false }).first()).toBeVisible();
  // exact 를 쓰지 않는다 — 목록 버튼의 접근성 이름에 "새 개념"/"얹힘" 배지가 함께 들어간다.
  await expect(conceptList(page).getByRole("button", { name: concept })).toBeVisible();
}

/** 위키 패널의 "이 노트의 개념" 목록. 개념을 고르면 목록 대신 열람 뷰로 바뀐다. */
const conceptList = (page: Page) => page.locator("text=이 노트의 개념").locator("xpath=following-sibling::ul[1]");

/** 임포트하고 방금 만들어진 개념을 연다(목록 → 열람). */
async function importAndOpen(page: Page, title: string, concept: string) {
  await importNote(page, title, concept);
  await conceptList(page).getByRole("button", { name: concept }).click();
}

test("인박스 위키 패널 — 방금 만들어진 개념이면 파인만이 자동으로 열린다", async ({ page }) => {
  // 위키 개념은 학습자가 만든 게 아니다 — 막 생성된 걸 그냥 읽고 넘기면 이해했다는 착각만 남는다.
  await importAndOpen(page, "자동 열기 테스트", "임계 구역");
  await expect(box(page)).toBeVisible();
});

test("인박스 위키 패널 — 이 노트에서 파생된 개념만 목록에 뜨고, 처음 만든 건지 얹힌 건지 표시한다", async ({ page }) => {
  // 판정은 sourceIds 다(llmApply). job 은 휘발성이라 못 쓴다 — 재시작하면 사라진다.
  await importNote(page, "목록 범위 테스트", "임계 구역"); // 목록에 머문다 — 개념을 클릭하면 열람 뷰로 바뀐다
  const list = conceptList(page);
  await expect(list.getByRole("button", { name: "임계 구역" })).toBeVisible();
  await expect(list.getByText("새 개념")).toBeVisible(); // sourceIds[0] === 이 노트
  // 이 노트와 무관한 seed 개념은 목록에 없다 — 공간 전체가 아니라 이 노트에서 나온 것만.
  await expect(list.getByRole("button", { name: "프로세스" })).toHaveCount(0);
});

test("인박스 위키 패널 — 본문 키워드로 연 남의 개념은 자동으로 안 열린다", async ({ page }) => {
  // 노트 쓰다가 참고하려고 옛 위키를 열었을 뿐인데 "설명하세요" 가 뜨면 필기가 끊긴다.
  // justImported 가 거짓인 게 "지금은 쓰는 시간" 신호다.
  await openInboxWiki(page, "프로세스");
  await expect(box(page)).toHaveCount(0);
  await expect(page.getByRole("button", { name: "파인만 기능" })).toBeVisible();
});

test("인박스 위키 패널 — 수동 버튼으로 시작하고 판정하면 카드가 남는다", async ({ page }) => {
  await openInboxWiki(page, "프로세스");
  // 임포트 직후가 아니라 참고로 연 것 — 자동으로 안 열린다
  await expect(box(page)).toHaveCount(0);
  await page.getByRole("button", { name: "파인만 기능" }).click();
  await box(page).fill("프로세스는 실행 중인 프로그램이에요");
  await page.getByRole("button", { name: "설명 보내기" }).click();
  await expect(page.getByText("실행 중이라는 게 정확히 무슨 뜻인가요?")).toBeVisible();
  await page.getByRole("button", { name: "네, 이해했어요" }).click();
  // onWikiSaved 가 없으면 여기서 카드가 안 나타난다(wikiBySlug 사본이 stale 로 남아 refWiki 가 안 바뀜)
  await expect(page.getByRole("button", { name: /이해함/ })).toBeVisible();
});

// ⚠ 삭제됨: "인박스 위키 패널 — conceptId 가 concept-syn-* 인 페이지엔 파인만이 안 붙는다"
//
// 이제 refWiki 로 정리 글이 **어느 경로로도** 도달할 수 없다 — 목록(derived)·키워드(termTitles)가
// 둘 다 isSynthesisPage 를 거르고, 그것 말고 refWikiPath 를 세팅하는 길이 없다.
// 그래서 패널의 !isSynthesisPage(refWiki) 가드는 도달 불가한 방어적 대칭으로만 남는다
// (같은 파일의 다른 isSynthesisPage 호출부·wikiReader 와 모양을 맞춰, 다음 사람이 비대칭을
// 보고 되돌리지 않게 하는 용도).
//
// 옛 테스트는 진짜 정리 글이 아니라 isSynthesisPage 의 접두사 충돌("Syn X" → concept-syn-x)을
// 타고 그 가드를 재현했다. 이제 그 우회로마저 목록 필터에 막혔다. 억지로 되살리면 테스트가
// 검증하는 건 가드가 아니라 **버그**("SYN Flood" 같은 실재 개념이 정리 글로 오인됨)이고,
// 누가 그 버그를 고치는 날 정리 글과 무관한 이름으로 실패해 고치는 사람을 오도한다.
// 충돌 버그는 후속 이슈(conceptId 스킴 변경 + 마이그레이션 필요).
