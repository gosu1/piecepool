import { Icons } from "../../ds";

// ══ 쿼리바 창 — 메인 앱과 별개로 뜨는 두 번째 창 ══
//
// 이 창은 `main.tsx` 가 창 이름표(label)를 보고 고른다. 메인 앱 화면(PiecePoolApp)과 같은 번들을
// 쓰되 그리는 것만 다르다. 설계: "쿼리바 설계" §1.
//
// 지금은 껍데기다 — 왼쪽 대화 목록 자리와 오른쪽 빈 화면, 그리고 아직 안 움직이는 입력창.
// 묻고 답하기(§2)·대화 저장(§6)·슬래시 명령(§4)은 이어지는 작업에서 채운다.

const EXAMPLES = [
  "지난주에 적어둔 것 중에 지금 쓸 만한 게 뭐야?",
  "내 위키에서 서로 어긋나는 내용 찾아줘",
  "이 주제에서 내가 아직 안 적어둔 빈틈이 뭐지?",
];

export default function QueryWindow() {
  return (
    <div className="flex h-screen bg-canvas text-ink">
      {/* 왼쪽 — 지난 대화. 저장 기능이 아직 없어 비어 있다(설계 §3·§6). */}
      <aside className="flex w-[216px] shrink-0 flex-col border-r border-hairline bg-chrome">
        <div className="m-2.5 mb-1.5 flex h-[34px] items-center gap-1.5 rounded-md border border-hairline bg-surface px-2.5 text-[13px] font-medium text-ink-2 shadow-soft">
          <Icons.PlusIcon size={15} />
          <span className="flex-1">새 대화</span>
        </div>
        <p className="px-3.5 pt-3 text-[11px] leading-relaxed text-ink-faint">
          지난 대화가 여기 쌓입니다.
        </p>
        <div className="mt-auto border-t border-hairline px-3.5 py-2.5 text-[11px] text-ink-faint">
          PiecePool 쿼리바
        </div>
      </aside>

      {/* 오른쪽 — 대화. 지금은 빈 화면만. */}
      <div className="flex min-w-0 flex-1 flex-col">
        <div className="flex flex-1 items-center justify-center overflow-hidden px-8">
          <div className="w-[420px] pb-6 text-center">
            <div className="mx-auto flex h-11 w-11 items-center justify-center rounded-full bg-surface-soft text-primary">
              <Icons.AskIcon size={22} />
            </div>
            <p className="mt-4 text-[20px] font-semibold leading-normal text-ink">쌓아둔 것에 물어보세요</p>
            <p className="mt-2 text-[13.5px] leading-relaxed text-ink-muted">
              이 워크스페이스의 위키와 자료를 읽고 답합니다
            </p>
            <div className="mt-6 flex flex-col gap-2">
              {EXAMPLES.map((q) => (
                <div
                  key={q}
                  className="flex items-center gap-2.5 rounded-md border border-hairline bg-surface px-3.5 py-2.5 text-left text-[14px] leading-snug text-ink-2"
                >
                  <span className="shrink-0 text-ink-faint">
                    <Icons.SearchIcon size={15} />
                  </span>
                  <span>{q}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* 입력창 — 아직 안 움직인다. 묻고 답하기(§2)를 붙일 자리. */}
        <div className="shrink-0 px-8 pb-4">
          <div className="flex items-center gap-2 rounded-lg border border-hairline bg-surface py-2.5 pl-3.5 pr-2.5 shadow-soft">
            <p className="min-w-0 flex-1 text-[15px] leading-relaxed text-ink-faint">아직 질문을 받을 수 없어요</p>
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-primary/40 text-on-primary">
              <Icons.ArrowRightIcon size={18} />
            </div>
          </div>
          <p className="mt-2 text-center text-[11px] text-ink-faint">묻고 답하기는 다음 작업에서 붙습니다</p>
        </div>
      </div>
    </div>
  );
}
