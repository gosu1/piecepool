// 블라인드 모델 A/B 리포트 — 순수 로직 (PRNG·셔플·라벨·집계·HTML 조립). I/O 없음.
// 러너: scripts/model-ab.ts. 설계: docs/superpowers/specs/2026-07-12-model-ab-harness-design.md

import type { LlmWikiResult } from "../src/llm/index";

export type AbTask = "wiki" | "feynman" | "pdfsummary";

export type FeynmanRound = { studentSaid: string; probe?: string; targetGap?: string; error?: string };

export type RawOutput = {
  task: AbTask;
  caseId: string;
  caseTitle: string;
  inputPreview: string; // 판정 참고용 원문 일부
  model: string;
  ok: boolean;
  latencyMs: number; // LLM 호출 시간만 (호출 간 대기 제외)
  error?: string;
  wiki?: { result: LlmWikiResult; rulePasses: string[]; ruleFailures: string[]; ruleWarnings: string[] };
  feynman?: { rounds: FeynmanRound[] };
  summaryMarkdown?: string;
};

export type ProbeResult = { model: string; alive: boolean; latencyMs?: number; reason?: string };

// 컬럼 = 익명화된 모델 출력. model 은 개봉 전 화면에 안 보이는 봉인 필드.
export type AbColumn = {
  label: string;
  model: string;
  ok: boolean;
  latencyMs: number;
  error?: string;
  wiki?: RawOutput["wiki"];
  feynman?: RawOutput["feynman"];
  summaryMarkdown?: string;
};

export type AbCase = { task: AbTask; caseId: string; caseTitle: string; inputPreview: string; columns: AbColumn[] };

export type ModelStats = { model: string; calls: number; failures: number; latencyP50: number | null; latencyMax: number | null };

export type AbReportData = { runId: string; models: string[]; probe: ProbeResult[]; cases: AbCase[]; stats: ModelStats[] };

// 결정적 PRNG — 테스트가 셔플 결과를 고정할 수 있어야 한다.
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function shuffleWithRng<T>(arr: T[], rng: () => number): T[] {
  const out = [...arr];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

const LABELS = ["A", "B", "C", "D"];

// 케이스 하나의 모델 출력들 → 랜덤 순서 + A/B 라벨 (위치 편향 방지). 매핑은 column.model 에 봉인.
export function labelColumns(outputs: RawOutput[], rng: () => number): AbColumn[] {
  return shuffleWithRng(outputs, rng).map((o, i) => ({
    label: LABELS[i] ?? String(i + 1),
    model: o.model,
    ok: o.ok,
    latencyMs: o.latencyMs,
    error: o.error,
    wiki: o.wiki,
    feynman: o.feynman,
    summaryMarkdown: o.summaryMarkdown,
  }));
}

export function buildStats(raw: RawOutput[], models: string[]): ModelStats[] {
  return models.map((model) => {
    const mine = raw.filter((r) => r.model === model);
    const lat = mine
      .filter((r) => r.ok)
      .map((r) => r.latencyMs)
      .sort((a, b) => a - b);
    return {
      model,
      calls: mine.length,
      failures: mine.filter((r) => !r.ok).length,
      latencyP50: lat.length ? lat[Math.floor(lat.length / 2)] : null,
      latencyMax: lat.length ? lat[lat.length - 1] : null,
    };
  });
}

// task/caseId 그룹핑 — 입력 등장 순서 유지.
export function buildReportData(
  runId: string,
  models: string[],
  probe: ProbeResult[],
  raw: RawOutput[],
  rng: () => number,
): AbReportData {
  const keys: string[] = [];
  const byCase = new Map<string, RawOutput[]>();
  for (const r of raw) {
    const k = `${r.task}/${r.caseId}`;
    if (!byCase.has(k)) {
      byCase.set(k, []);
      keys.push(k);
    }
    byCase.get(k)!.push(r);
  }
  const cases: AbCase[] = keys.map((k) => {
    const outputs = byCase.get(k)!;
    const first = outputs[0];
    return {
      task: first.task,
      caseId: first.caseId,
      caseTitle: first.caseTitle,
      inputPreview: first.inputPreview,
      columns: labelColumns(outputs, rng),
    };
  });
  return { runId, models, probe, cases, stats: buildStats(raw, models) };
}

// 자급자족 판정 HTML. 블라인드(랜덤 라벨) → 전 케이스 판정 → 개봉(모델명 공개 + 집계).
// CDN(marked·KaTeX)은 로컬 파일이라 CSP 무관. 내부 JS는 템플릿 리터럴 충돌을 피해 문자열 연결만 쓴다.
export function renderReportHtml(data: AbReportData): string {
  const json = JSON.stringify(data).replace(/</g, "\\u003c");
  return `<!doctype html>
<html lang="ko">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>모델 A/B 블라인드 판정</title>
<link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/katex@0.16.11/dist/katex.min.css">
<script defer src="https://cdn.jsdelivr.net/npm/katex@0.16.11/dist/katex.min.js"></script>
<script defer src="https://cdn.jsdelivr.net/npm/katex@0.16.11/dist/contrib/auto-render.min.js"></script>
<script src="https://cdn.jsdelivr.net/npm/marked@12.0.2/marked.min.js"></script>
<style>
body{font-family:-apple-system,"Apple SD Gothic Neo",sans-serif;margin:0;background:#f6f7f9;color:#1f2328}
#top{padding:14px 24px;background:#fff;border-bottom:1px solid #e1e4e8;position:sticky;top:0;z-index:5;display:flex;gap:16px;align-items:baseline}
h1{font-size:16px;margin:0}
#progress{color:#57606a;font-size:13px}
.case{margin:24px;background:#fff;border:1px solid #e1e4e8;border-radius:8px;overflow:hidden}
.case-head{padding:12px 16px;border-bottom:1px solid #e1e4e8}
.badge{display:inline-block;font-size:11px;padding:2px 8px;border-radius:10px;background:#ddf4ff;color:#0969da;margin-right:8px}
details{margin-top:8px;font-size:13px;color:#57606a}
details pre{white-space:pre-wrap}
.cols{display:grid;grid-template-columns:repeat(auto-fit,minmax(320px,1fr))}
.col{padding:16px;border-left:1px solid #e1e4e8;min-width:0}
.col:first-child{border-left:none}
.col h3{margin:0 0 8px;font-size:14px}
.model-name{color:#cf222e;font-weight:600}
.md{font-size:14px;line-height:1.7;overflow-x:auto}
.md blockquote{border-left:3px solid #0969da;margin:8px 0;padding:4px 12px;background:#f6f8fa}
.bubble{border-radius:8px;padding:8px 12px;margin:6px 0;font-size:14px}
.bubble.student{background:#f6f8fa}
.bubble.probe{background:#ddf4ff}
.gap{font-size:11px;color:#0969da;margin-left:6px}
.rule-pass{color:#1a7f37;font-size:13px}
.rule-fail{color:#cf222e;font-size:13px}
.rule-warn{color:#9a6700;font-size:13px}
.err{color:#cf222e;font-size:13px}
.verdict{padding:12px 16px;border-top:1px solid #e1e4e8;background:#fafbfc;font-size:14px}
.verdict label{margin-right:16px;cursor:pointer}
#footer{margin:24px;padding:16px;background:#fff;border:1px solid #e1e4e8;border-radius:8px}
#footer button{font-size:14px;padding:8px 16px;border-radius:6px;border:1px solid #d0d7de;background:#2da44e;color:#fff;cursor:pointer;margin-right:8px}
#footer button:disabled{background:#94d3a2;cursor:not-allowed}
table{border-collapse:collapse;margin-top:12px;font-size:13px}
td,th{border:1px solid #d0d7de;padding:6px 10px;text-align:left}
ul{margin:4px 0;padding-left:20px}
.hidden{display:none}
</style>
</head>
<body>
<div id="top"><h1>모델 A/B 블라인드 판정</h1><span id="progress"></span></div>
<div id="cases"></div>
<div id="footer">
  <button id="reveal" disabled>개봉 — 모델명 공개 + 집계</button>
  <button id="save" class="hidden">결과 저장 (JSON)</button>
  <div id="result"></div>
</div>
<script>
const DATA = ${json};
</script>
<script>
"use strict";
var verdicts = {}; // "task/caseId" -> 라벨 | "tie"
var TASK_LABEL = { wiki: "위키 생성", feynman: "파인만 되묻기", pdfsummary: "PDF 한국어 요약" };

function h(tag, cls, html) {
  var e = document.createElement(tag);
  if (cls) e.className = cls;
  if (html !== undefined) e.innerHTML = html;
  return e;
}
// text node 전용 — 속성값에 넣으면 따옴표가 이스케이프되지 않아 뚫린다
function esc(s) {
  var d = document.createElement("div");
  d.textContent = s == null ? "" : String(s);
  return d.innerHTML;
}
function key(c) { return c.task + "/" + c.caseId; }

function renderColumn(col) {
  var box = h("div", "col");
  box.appendChild(h("h3", null, "안 " + esc(col.label) + ' <span class="model-name hidden">— ' + esc(col.model) + "</span>"));
  if (!col.ok && !col.feynman) {
    box.appendChild(h("div", "err", "생성 실패: " + esc(col.error || "")));
    return box;
  }
  if (col.summaryMarkdown !== undefined) {
    var md = h("div", "md");
    // 원시 HTML 무력화 — LLM 요약이 실어온 태그가 실행되지 않게 & < 선-이스케이프 (마크다운 문법 비파괴)
    md.innerHTML = marked.parse(col.summaryMarkdown.replace(/&/g, "&amp;").replace(/</g, "&lt;"));
    md.querySelectorAll("a").forEach(function (a) {
      var href = a.getAttribute("href") || "";
      if (!/^https?:/i.test(href)) a.removeAttribute("href");
    });
    box.appendChild(md);
  } else if (col.feynman) {
    col.feynman.rounds.forEach(function (r) {
      box.appendChild(h("div", "bubble student", esc(r.studentSaid)));
      if (r.probe) box.appendChild(h("div", "bubble probe", esc(r.probe) + '<span class="gap">' + esc(r.targetGap || "") + "</span>"));
      if (r.error) box.appendChild(h("div", "err", "실패: " + esc(r.error)));
    });
  } else if (col.wiki) {
    var w = col.wiki;
    box.appendChild(h("div", null, "<strong>개념 " + w.result.concepts.length + "</strong>"));
    var cul = h("ul");
    w.result.concepts.forEach(function (c) { cul.appendChild(h("li", null, esc(c.title))); });
    box.appendChild(cul);
    box.appendChild(h("div", null, "<strong>관계 " + w.result.relations.length + "</strong>"));
    var rul = h("ul");
    w.result.relations.forEach(function (r) {
      rul.appendChild(h("li", null, esc(r.sourceConceptTitle) + " —[" + esc(r.relationType) + "]→ " + esc(r.targetConceptTitle)));
    });
    box.appendChild(rul);
    box.appendChild(h("div", null,
      '<span class="rule-pass">규칙 ✓ ' + w.rulePasses.length + "</span>" +
      (w.ruleFailures.length ? ' <span class="rule-fail">✗ ' + w.ruleFailures.map(esc).join(" · ") + "</span>" : "") +
      (w.ruleWarnings.length ? ' <span class="rule-warn">⚠ ' + w.ruleWarnings.length + "</span>" : "")));
  }
  return box;
}

function renderCase(c) {
  var box = h("section", "case");
  var head = h("div", "case-head");
  head.appendChild(h("div", null, '<span class="badge">' + TASK_LABEL[c.task] + "</span><strong>" + esc(c.caseTitle) + "</strong>"));
  head.appendChild(h("details", null, "<summary>입력 원문 보기</summary><pre>" + esc(c.inputPreview) + "</pre>"));
  box.appendChild(head);
  var cols = h("div", "cols");
  c.columns.forEach(function (col) { cols.appendChild(renderColumn(col)); });
  box.appendChild(cols);
  var v = h("div", "verdict");
  var k = key(c);
  var opts = c.columns.map(function (col) { return col.label; }).concat(["tie"]);
  opts.forEach(function (o) {
    var lab = h("label");
    var input = document.createElement("input");
    input.type = "radio";
    input.name = k;
    input.value = o;
    input.addEventListener("change", function () { verdicts[k] = o; updateProgress(); });
    lab.appendChild(input);
    lab.appendChild(document.createTextNode(o === "tie" ? " 무승부" : " 안 " + o + " 승"));
    v.appendChild(lab);
  });
  box.appendChild(v);
  return box;
}

function updateProgress() {
  var done = Object.keys(verdicts).length;
  document.getElementById("progress").textContent = "판정 " + done + " / " + DATA.cases.length + " — run " + DATA.runId;
  document.getElementById("reveal").disabled = done < DATA.cases.length;
}

function tally() {
  var wins = {}; // task -> model -> n
  var ties = {}; // task -> n
  DATA.cases.forEach(function (c) {
    var v = verdicts[key(c)];
    if (v === "tie") { ties[c.task] = (ties[c.task] || 0) + 1; return; }
    var col = c.columns.find(function (x) { return x.label === v; });
    if (!col) return;
    if (!wins[c.task]) wins[c.task] = {};
    wins[c.task][col.model] = (wins[c.task][col.model] || 0) + 1;
  });
  return { wins: wins, ties: ties };
}

document.getElementById("reveal").addEventListener("click", function () {
  document.querySelectorAll(".verdict input").forEach(function (i) { i.disabled = true; });
  document.querySelectorAll(".model-name").forEach(function (e) { e.classList.remove("hidden"); });
  var t = tally();
  var out = "<h2>집계</h2><table><tr><th>작업</th>";
  DATA.models.forEach(function (m) { out += "<th>" + esc(m) + "</th>"; });
  out += "<th>무승부</th></tr>";
  var totals = {};
  Object.keys(TASK_LABEL).forEach(function (task) {
    if (!DATA.cases.some(function (c) { return c.task === task; })) return;
    out += "<tr><td>" + TASK_LABEL[task] + "</td>";
    DATA.models.forEach(function (m) {
      var n = (t.wins[task] || {})[m] || 0;
      totals[m] = (totals[m] || 0) + n;
      out += "<td>" + n + "</td>";
    });
    out += "<td>" + (t.ties[task] || 0) + "</td></tr>";
  });
  out += "<tr><th>합계</th>";
  DATA.models.forEach(function (m) { out += "<th>" + (totals[m] || 0) + "</th>"; });
  var tieTotal = Object.keys(t.ties).reduce(function (a, k2) { return a + t.ties[k2]; }, 0);
  out += "<th>" + tieTotal + "</th></tr></table>";

  out += "<h2>프로브·지연 통계</h2><table><tr><th>모델</th><th>프로브</th><th>호출</th><th>실패</th><th>지연 p50</th><th>지연 max</th></tr>";
  DATA.models.forEach(function (m) {
    var p = DATA.probe.find(function (x) { return x.model === m; });
    var s = DATA.stats.find(function (x) { return x.model === m; });
    out += "<tr><td>" + esc(m) + "</td>";
    out += "<td>" + (p ? (p.alive ? "생존 " + p.latencyMs + "ms" : "탈락: " + esc(p.reason || "")) : "-") + "</td>";
    out += "<td>" + (s ? s.calls : 0) + "</td><td>" + (s ? s.failures : 0) + "</td>";
    out += "<td>" + (s && s.latencyP50 != null ? s.latencyP50 + "ms" : "-") + "</td>";
    out += "<td>" + (s && s.latencyMax != null ? s.latencyMax + "ms" : "-") + "</td></tr>";
  });
  out += "</table>";
  document.getElementById("result").innerHTML = out;
  document.getElementById("save").classList.remove("hidden");
});

document.getElementById("save").addEventListener("click", function () {
  var blob = new Blob([JSON.stringify({ runId: DATA.runId, verdicts: verdicts, tally: tally() }, null, 2)], { type: "application/json" });
  var a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = "verdicts-" + DATA.runId + ".json";
  a.click();
});

DATA.cases.forEach(function (c) { document.getElementById("cases").appendChild(renderCase(c)); });
updateProgress();
// KaTeX 는 defer — DOM 준비 후 수식 렌더 ($...$ 인라인, $$...$$ 블록)
window.addEventListener("DOMContentLoaded", function () {
  if (!window.renderMathInElement) return;
  document.querySelectorAll(".md").forEach(function (e) {
    renderMathInElement(e, {
      delimiters: [
        { left: "$$", right: "$$", display: true },
        { left: "$", right: "$", display: false },
      ],
      throwOnError: false,
    });
  });
});
</script>
</body>
</html>
`;
}
