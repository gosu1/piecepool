// 위키백과 수집 — 실험 입력(평문 .md)과 정답지(ground-truth.json)를 만든다.
//
// 정답지 3종은 전부 위키백과 편집자가 이미 내려둔 판정이다:
//   본문 [[링크]]  — "별도 문서 자격이 있다". 하단 틀(navbox)의 링크는 제외한다.
//                    prop=links 를 그대로 쓰면 안 되는 이유: 본문 660자짜리 문서가 링크 324개로 잡힌다.
//   걸침 횟수      — 몇 개 문서의 본문에서 불렸나. 반복 테스트의 대응물(논리 아닌 실측).
//   리다이렉트     — "이 표기들은 같은 개념". normalizeTitle dedup 의 대응물.
//
// 본문 텍스트는 저장만 하고 커밋하지 않는다(CC BY-SA). 재현은 이 스크립트를 다시 돌리면 된다.
//
// 실행: npm run wiki-collect -- --dir <출력디렉토리>

import { writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";

const UA = "PiecePool-Seminar-Experiment/0.1 (research)";
const API = "https://ko.wikipedia.org/w/api.php";

// 학습 순서대로 넣는다 — 뒤 문서가 앞 문서의 개념을 보게 하려면 순서가 결과를 바꾼다.
// 파일명은 ASCII 로 둔다(한글 제목이면 archive 파일명이 -2, -3 으로 붕괴한다).
const PAGES: Array<{ page: string; file: string }> = [
  { page: "기계 학습", file: "wiki-01-machine-learning.md" },
  { page: "인공 신경망", file: "wiki-02-artificial-neural-network.md" },
  { page: "딥 러닝", file: "wiki-03-deep-learning.md" },
  { page: "순환 신경망", file: "wiki-04-recurrent-neural-network.md" },
  { page: "트랜스포머 (기계 학습)", file: "wiki-05-transformer.md" },
];

async function api(params: Record<string, string>): Promise<any> {
  const url = `${API}?${new URLSearchParams({ ...params, format: "json", formatversion: "2" })}`;
  const res = await fetch(url, { headers: { "User-Agent": UA } });
  if (!res.ok) throw new Error(`위키백과 API ${res.status} — ${params.page ?? params.titles}`);
  return res.json();
}

// 본문 [[링크]]만 — 틀/각주/하단 절을 걷어낸 뒤 센다.
function bodyLinks(wikitext: string): string[] {
  let wt = wikitext.replace(/<ref[^>]*>[\s\S]*?<\/ref>/g, "").replace(/\{\{[^{}]*\}\}/g, "");
  wt = wt.split(/\n==\s*(?:같이 보기|각주|참고 문헌|외부 링크|참고자료)\s*==/)[0];
  const out: string[] = [];
  for (const m of wt.matchAll(/\[\[([^\]|#]+)(?:\|[^\]]*)?\]\]/g)) {
    const t = m[1].trim();
    if (!t.includes(":")) out.push(t); // 분류:/파일: 제외
  }
  return out;
}

function argDir(): string {
  const i = process.argv.indexOf("--dir");
  if (i < 0 || !process.argv[i + 1]) throw new Error("--dir <출력디렉토리> 필요");
  return process.argv[i + 1];
}

async function main() {
  const dir = argDir();
  mkdirSync(join(dir, "input"), { recursive: true });
  const out = [];

  for (const [i, p] of PAGES.entries()) {
    const parsed = (await api({ action: "parse", page: p.page, prop: "wikitext", redirects: "1" })).parse;
    await new Promise((r) => setTimeout(r, 1200)); // 위키백과 API 예의
    const q = (
      await api({
        action: "query",
        titles: p.page,
        prop: "extracts|redirects",
        explaintext: "1",
        rdlimit: "max",
        redirects: "1",
      })
    ).query.pages[0];
    await new Promise((r) => setTimeout(r, 1200));

    const title: string = parsed.title;
    const text: string = q.extract ?? "";
    const links = bodyLinks(parsed.wikitext);
    const redirects: string[] = (q.redirects ?? []).map((r: { title: string }) => r.title);

    writeFileSync(join(dir, "input", p.file), `# ${title}\n\n${text}\n`, "utf-8");
    out.push({
      order: i + 1,
      file: p.file,
      title,
      chars: text.length,
      bodyLinks: [...new Set(links)].sort(),
      bodyLinkHits: links.length,
      redirects,
    });
    console.log(
      `${i + 1}. ${title.padEnd(22)} 평문 ${String(text.length).padStart(6)}자  본문링크 ${String(new Set(links).size).padStart(3)}종  리다이렉트 ${redirects.length}`,
    );
  }

  writeFileSync(join(dir, "ground-truth.json"), JSON.stringify(out, null, 2), "utf-8");
  console.log(`\n저장: ${join(dir, "ground-truth.json")}`);
}

main();
