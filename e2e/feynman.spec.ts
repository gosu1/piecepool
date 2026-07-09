import { test, expect } from "@playwright/test";

// 파인만식 되묻기 — 설명 생산 루프. 설계: docs/superpowers/specs/2026-07-10-feynman-clarify-design.md
// LLM 은 라우트로 가로챈다. 위키 생성 요청과 되묻기 요청은 시스템 프롬프트로 구분한다.

const chat = (payload: unknown) => ({
  status: 200,
  contentType: "application/json",
  body: JSON.stringify({ choices: [{ message: { content: JSON.stringify(payload) } }] }),
});

const concept = (title: string, explanation: string) => ({
  title,
  summary: `${title} 요약`,
  explanation,
  examples: [],
  sourceRefs: [],
  sourceEmbeds: [],
});

const WIKI = { concepts: [concept("임계 구역", "동시 접근하면 결과가 달라진다."), concept("세마포어", "허용 개수를 센다.")], relations: [] };

let probeCalls = 0;

test.beforeEach(async ({ page }) => {
  probeCalls = 0;
  // 키가 없으면 engine=heuristic 이라 되묻기가 뜨지 않는다(설계상 의도: 없는 걸 있는 척하지 않는다).
  await page.addInitScript(() => localStorage.setItem("gemini-key", "test-key"));
  await page.route("**generativelanguage.googleapis.com**", async (route) => {
    const body = route.request().postData() ?? "";
    if (body.includes("Feynman-technique tutor")) {
      probeCalls++;
      await route.fulfill(chat({ probe: "왜 동시에 들어가면 안 되나요?", targetGap: "why" }));
    } else {
      await route.fulfill(chat(WIKI));
    }
  });
  await page.goto("/");
  await expect(page.getByRole("button", { name: "프로세스", exact: true })).toBeVisible();
});

async function openFeynman(page: import("@playwright/test").Page) {
  await page.getByRole("button", { name: "새 노트 작성" }).click();
  await page.getByPlaceholder("새 페이지").fill("운영체제 3주차");
  await page.locator(".cm-content").click();
  await page.keyboard.type("임계 구역에는 락을 건다. 세마포어도 배웠다.");
  await page.getByRole("button", { name: /되묻기/ }).click();
  await page.getByRole("button", { name: /AI 정리/ }).click();
  await expect(page.getByLabel("개념 설명")).toBeVisible();
}

test("되묻기는 선택지가 아니라 빈 칸을 준다 — 사용자가 설명을 생산한다", async ({ page }) => {
  await openFeynman(page);
  await expect(page.getByText(/처음 배우는 사람에게 설명해보세요/)).toBeVisible();
  // 옛 선택지형 clarify 의 잔재가 없어야 한다
  await expect(page.getByPlaceholder("직접 설명(기타)")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "건너뛰기(1차 저장)" })).toHaveCount(0);
});

test("설명 → 되물음 → 재설명 루프가 돈다 (사용자가 [그만] 누를 때까지)", async ({ page }) => {
  await openFeynman(page);
  const explain = page.getByLabel("개념 설명");

  await explain.fill("여러 스레드가 동시에 들어가면 안 되는 코드 부분이요");
  await page.getByRole("button", { name: "설명 보내기" }).click();
  await expect(page.getByText("왜 동시에 들어가면 안 되나요?")).toBeVisible();
  await expect(page.getByText(/나: 여러 스레드가 동시에/)).toBeVisible();

  await explain.fill("값이 꼬여서요");
  await page.getByRole("button", { name: "다시 설명" }).click();
  await expect(page.getByText(/나: 값이 꼬여서요/)).toBeVisible();
  expect(probeCalls).toBe(2); // 라운드마다 한 번씩. 위키는 아직 안 만든다.
});

test("[아직 모르겠어요] → review_needed self-loop → 그래프 빨간 점선 테두리", async ({ page }) => {
  await openFeynman(page);
  await page.getByLabel("개념 설명").fill("동시에 들어가면 안 되는 코드요");
  await page.getByRole("button", { name: "설명 보내기" }).click();
  await expect(page.getByText("왜 동시에 들어가면 안 되나요?")).toBeVisible();

  await page.getByRole("button", { name: "아직 모르겠어요" }).click();
  await expect(page.getByText(/복습 필요로 표시했어요/)).toBeVisible();

  await page.getByRole("button", { name: "Graph" }).click();
  await expect(page.getByText("타입 있는 개념 그래프")).toBeVisible();
  // 복습 그룹 칩이 뜬다 = relations.json 에 review_needed 가 실재한다
  await expect(page.getByRole("button", { name: "복습" })).toBeVisible();
});

test("설명 0회 + [아직 모르겠어요] → 조용히 넘기지 않고 알린다", async ({ page }) => {
  await openFeynman(page);
  // 설명을 한 번도 쓰지 않았다 → evidence 가 없어 표시할 수 없다(graph.rs 계약)
  await page.getByRole("button", { name: "아직 모르겠어요" }).click();
  await expect(page.getByText(/설명을 한 번도 쓰지 않아 복습 표시를 하지 않았어요/)).toBeVisible();
});

test("되묻기 실패 → 설명을 보존하고 [다시 시도] 로 재타이핑 없이 복구한다", async ({ page }) => {
  await openFeynman(page);
  // 다음 probe 만 503 으로 떨어뜨린다 (재시도 소진되도록 계속 503)
  let failProbe = true;
  await page.unroute("**generativelanguage.googleapis.com**");
  await page.route("**generativelanguage.googleapis.com**", async (route) => {
    const body = route.request().postData() ?? "";
    if (body.includes("Feynman-technique tutor")) {
      if (failProbe) return route.fulfill({ status: 503, body: "" });
      return route.fulfill(chat({ probe: "왜 그럴까요?", targetGap: "why" }));
    }
    await route.fulfill(chat(WIKI));
  });

  await page.getByLabel("개념 설명").fill("동시에 못 들어가게 막는 거요");
  await page.getByRole("button", { name: "설명 보내기" }).click();
  await expect(page.getByText(/되묻기에 실패했어요/)).toBeVisible({ timeout: 20000 });
  // 사용자가 쓴 설명은 대화에 남아 있다
  await expect(page.getByText(/나: 동시에 못 들어가게 막는 거요/)).toBeVisible();

  failProbe = false;
  await page.getByRole("button", { name: "다시 시도" }).click();
  await expect(page.getByText("왜 그럴까요?")).toBeVisible({ timeout: 20000 });
});

test("2차 생성이 실패해도 1차 Gemini 결과를 휴리스틱으로 덮어쓰지 않는다", async ({ page }) => {
  await openFeynman(page);
  await page.getByLabel("개념 설명").fill("동시에 못 들어가게 막는 거요");
  await page.getByRole("button", { name: "설명 보내기" }).click();
  await expect(page.getByText("왜 동시에 들어가면 안 되나요?")).toBeVisible();

  // 이제부터 위키 생성 요청만 죽인다 → runWikiGeneration 이 휴리스틱으로 폴백한다
  await page.unroute("**generativelanguage.googleapis.com**");
  await page.route("**generativelanguage.googleapis.com**", async (route) => {
    const body = route.request().postData() ?? "";
    if (body.includes("Feynman-technique tutor")) return route.fulfill(chat({ probe: "왜요?", targetGap: "why" }));
    await route.fulfill({ status: 503, body: "" });
  });

  await page.getByRole("button", { name: "네, 이해했어요" }).click();
  await expect(page.getByText(/AI 재생성에 실패해 첫 정리 결과를 그대로 저장했어요/)).toBeVisible({ timeout: 30000 });
  // 1차 결과(임계 구역·세마포어)가 살아 있다 — 헤딩 분해 결과로 대체되지 않았다
  await expect(page.getByRole("complementary").getByRole("button", { name: "세마포어" })).toBeVisible();
});

test("표시 → 해제 왕복 — 사용자가 붙이고 사용자가 거둔다", async ({ page }) => {
  await openFeynman(page);
  await page.getByLabel("개념 설명").fill("동시에 들어가면 안 되는 코드요");
  await page.getByRole("button", { name: "설명 보내기" }).click();
  await expect(page.getByText("왜 동시에 들어가면 안 되나요?")).toBeVisible();
  await page.getByRole("button", { name: "아직 모르겠어요" }).click();
  await expect(page.getByText(/복습 필요로 표시했어요/)).toBeVisible();

  await page.getByRole("button", { name: "Graph" }).click();
  await expect(page.getByRole("button", { name: "복습" })).toBeVisible();

  // 노드는 Cytoscape 캔버스라 DOM 클릭이 안 된다 — "개념 찾기" 로 선택한다(pickMatch).
  // 트리에도 "세마포어" 버튼이 있으므로 검색 드롭다운 안으로 범위를 좁힌다.
  const search = page.getByPlaceholder("개념 찾기…");
  await search.fill("세마포어");
  await search.locator("xpath=following-sibling::div").getByRole("button", { name: "세마포어", exact: true }).click();
  await expect(page.getByText("아직 모르겠다고 표시한 개념")).toBeVisible();

  await page.getByRole("button", { name: "표시 해제" }).click();
  await expect(page.getByText(/복습 표시를 해제했어요/)).toBeVisible({ timeout: 15000 });
  // 관계가 사라졌으므로 복습 그룹 칩도 사라진다
  await expect(page.getByRole("button", { name: "복습" })).toHaveCount(0);
  await expect(page.getByText("아직 모르겠다고 표시한 개념")).toHaveCount(0);
});

test("[네, 이해했어요] → 표시하지 않는다 (판정은 사용자가 한다)", async ({ page }) => {
  await openFeynman(page);
  await page.getByLabel("개념 설명").fill("동시에 들어가면 안 되는 코드요");
  await page.getByRole("button", { name: "설명 보내기" }).click();
  await expect(page.getByText("왜 동시에 들어가면 안 되나요?")).toBeVisible();

  await page.getByRole("button", { name: "네, 이해했어요" }).click();
  await expect(page.getByText(/복습 필요로 표시했어요/)).toHaveCount(0);

  await page.getByRole("button", { name: "Graph" }).click();
  await expect(page.getByText("타입 있는 개념 그래프")).toBeVisible();
  await expect(page.getByRole("button", { name: "복습" })).toHaveCount(0);
});
