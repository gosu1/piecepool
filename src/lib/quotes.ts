import type { LoadingQuoteItem } from "../ds";

// 로딩 화면에 순환 표시하는 명언 모음 — 리처드 파인만 · 안드레 카파시.
// original 은 웹 출처 검증을 거친 영어 원문 그대로(표기·구두점 포함), text 는 한국어 번역.
// 오귀속으로 판명된 인용("I would rather have questions..." 등)은 수록하지 않는다.
export const LOADING_QUOTES: LoadingQuoteItem[] = [
  {
    // 1988년 파인만 사망 당시 칼텍 칠판에 남아 있던 문장 (Caltech Archives)
    text: "내가 만들어낼 수 없는 것은, 이해하지 못한 것이다.",
    original: "What I cannot create, I do not understand.",
    author: "리처드 파인만",
  },
  {
    // 1974년 칼텍 졸업식 연설 "Cargo Cult Science"
    text: "제1원칙은 자기 자신을 속이지 말라는 것이다 — 가장 속이기 쉬운 사람이 바로 자신이니까.",
    original: "The first principle is that you must not fool yourself—and you are the easiest person to fool.",
    author: "리처드 파인만",
  },
  {
    // 회고록 "What Do You Care What Other People Think?" (1988)
    text: "나는 무언가의 이름을 아는 것과 그것을 정말 아는 것의 차이를 아주 일찍 배웠다.",
    original: "I learned very early the difference between knowing the name of something and knowing something.",
    author: "리처드 파인만",
  },
  {
    // 1965년 J. M. Szabados 에게 보낸 편지 ("Perfectly Reasonable Deviations from the Beaten Track")
    text: "가장 흥미를 끄는 것을, 최대한 자유분방하고 불손하며 독창적인 방식으로 파고들어라.",
    original: "Study hard what interests you the most in the most undisciplined, irreverent and original manner possible.",
    author: "리처드 파인만",
  },
  {
    // 1966년 마이크 플라사에게 보낸 편지 (같은 서간집)
    text: "어떤 활동과 사랑에 빠져야 한다.",
    original: "You must fall in love with some activity.",
    author: "리처드 파인만",
  },
  {
    // 2023-01-24 X(트위터) 게시글 — 원문에 마침표 없음
    text: "가장 뜨거운 새 프로그래밍 언어는 영어다.",
    original: "The hottest new programming language is English",
    author: "안드레 카파시",
  },
  {
    // 2017-08-04 X(트위터) 게시글
    text: "경사하강법이 너보다 코드를 잘 짠다. 미안.",
    original: "Gradient descent can write code better than you. I'm sorry.",
    author: "안드레 카파시",
  },
  {
    // 2020-11-07 X(트위터) 게시글 (원문은 1/2/3 줄바꿈 목록 — 한 줄로 이어 적음)
    text: "전문가가 되는 법: 1) 구체적인 프로젝트를 잡아 필요한 것을 그때그때 배우며 깊이 파고들 것(밑에서부터 넓게 배우지 말 것) 2) 배운 것을 전부 자기 말로 가르치듯 요약해 볼 것 3) 남이 아니라 과거의 나와만 비교할 것.",
    original:
      'How to become expert at thing: 1 iteratively take on concrete projects and accomplish them depth wise, learning "on demand" (ie don\'t learn bottom up breadth wise) 2 teach/summarize everything you learn in your own words 3 only compare yourself to younger you, never to others',
    author: "안드레 카파시",
  },
  {
    // 2025-02-02 X(트위터) 게시글 — "바이브 코딩"의 어원
    text: "'바이브 코딩'이라 부르는 새로운 코딩이 있다 — 분위기에 완전히 몸을 맡기고, 지수적 발전을 껴안고, 코드가 존재한다는 사실조차 잊는 것.",
    original:
      'There\'s a new kind of coding I call "vibe coding", where you fully give in to the vibes, embrace exponentials, and forget that the code even exists.',
    author: "안드레 카파시",
  },
];
