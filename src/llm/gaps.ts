// 정보 간극 메우기 (README §LLM ③). 정답(label=교수 자료)과 사용자 필기 사이 간극을
// 소크라테스/하브루타식으로 되묻는다 — 정답을 주입하지 않고 1~3개 선택지 + "기타"로 가이드.
// MVP: 노트 자체를 근거로 한 휴리스틱 점검(라벨 PDF 대조는 후속). 구조는 README 사양을 따른다.

export interface GapQuestion {
  context: string; // 점검 대상 개념/구절
  prompt: string; // "이렇게 생각하신 게 맞나요?"
  choices: string[]; // 1~3개 가이드 선택지
  allowOther: boolean; // "기타" 직접 설명 칸
}

export function heuristicGaps(title: string, text: string): GapQuestion[] {
  const secs = splitSections(text);
  const targets = secs.length ? secs.slice(0, 3) : [{ title, body: text }];
  return targets.map((s) => {
    const claim = firstSentence(s.body) || `${s.title}의 핵심`;
    return {
      context: s.title,
      prompt: `"${s.title}"에 대해 이렇게 이해하신 게 맞나요?`,
      choices: [claim, "부분적으로만 맞는 것 같다", "헷갈려서 다시 정리하고 싶다"].filter(Boolean).slice(0, 3),
      allowOther: true,
    };
  });
}

interface Section {
  title: string;
  body: string;
}
function splitSections(md: string): Section[] {
  const lines = md.replace(/\r\n/g, "\n").split("\n");
  const out: Section[] = [];
  let cur: Section | null = null;
  for (const line of lines) {
    const h = /^(#{1,3})\s+(.*)$/.exec(line.trim());
    if (h) {
      if (cur) out.push(cur);
      cur = { title: h[2].replace(/[*`]/g, "").trim(), body: "" };
    } else if (cur) cur.body += line + "\n";
  }
  if (cur) out.push(cur);
  return out.filter((s) => s.title);
}
function firstSentence(text: string): string {
  const flat = text.replace(/[#*`>\-]/g, " ").replace(/\s+/g, " ").trim();
  const m = /^(.{0,120}?[.!?。])(\s|$)/.exec(flat);
  return (m ? m[1] : flat.slice(0, 120)).trim();
}
