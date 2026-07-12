import type { LlmWikiResult, LlmConcept, LlmEvidence, LlmWikiInput } from "../llm/provider";
import type { WikiPage, Relation, Evidence, SourceRef, ArchiveNote } from "./types";
import { parseWikilinks, parseEmbedTarget, firstEmbedFile } from "./wikilink";
import * as ipc from "./ipc";

// LlmWikiResult → WikiPage[] + Relation[] 변환 후 백엔드에 저장.
// 변환 파이프라인: docs/10-contracts/llm-output-schema.md (LlmConcept→Concept+WikiPage, LlmRelation→Relation).
// dedup: normalizedTitle(NFC+소문자+공백정규화) 이 기존 위키와 일치하면 그 파일에 MERGE(새 .md 만들지 않음).

export function normalizeTitle(t: string): string {
  return t.normalize("NFC").toLowerCase().replace(/\s+/g, " ").trim();
}
function slugify(t: string): string {
  return t
    .normalize("NFC")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}
function hash8(t: string): string {
  const n = normalizeTitle(t);
  let h = 5381;
  for (let i = 0; i < n.length; i++) h = ((h << 5) + h + n.charCodeAt(i)) >>> 0;
  return h.toString(16);
}
// 파일/개념 slug — ASCII 슬러그 우선, 한글 등 비ASCII 제목은 normalizedTitle 해시로 안정화(같은 개념 → 같은 파일 → merge).
export function slugOrHash(title: string): string {
  const s = slugify(title);
  return s || `c-${hash8(title)}`;
}

/** 이 위키/관계를 만든 원본 노트. */
export interface ImportSource {
  sourceId: string;
  archivePath: string;
  title: string;
}

// ── 본문 축적: 노트별 블록 덧붙이기 ────────────────────────────────
// 한 개념이 여러 노트에서 추출되면, 기존 본문을 덮지 않고 노트마다 블록을 아래에 쌓는다.
// 각 블록은 `<!-- src:{sourceId} -->` 마커로 시작한다 — 같은 노트를 재처리하면 그 블록만
// 교체되어 중복 append 를 막는다(멱등).
// 주의: 사용자가 LLM 블록 *안*을 직접 고쳤다면 그 노트 재처리 시 함께 교체된다.
const srcMark = (sourceId: string) => `<!-- src:${sourceId} -->`;

function sourceBlock(c: LlmConcept, source: ImportSource): string {
  const parts = [srcMark(source.sourceId), `## ${source.title}에서`, "", c.summary];
  if (c.explanation && c.explanation.trim() !== c.summary.trim()) parts.push("", c.explanation.trim());
  if (c.examples && c.examples.length) parts.push("", "### 예시", ...c.examples.map((e) => `- ${e}`));
  // sourceEmbeds 는 validate.ts(canonicalEmbed)가 이미 `![[file]]` 형태로 정규화해 넘긴다.
  // 여기서 다시 감싸면 `![[![[file]]]]` 가 되고, 파서가 파일명을 `![[file` 로 읽어 임베드가 깨진다.
  if (c.sourceEmbeds && c.sourceEmbeds.length) parts.push("", "### 근거", ...c.sourceEmbeds);
  if (c.confusingConcepts && c.confusingConcepts.length)
    parts.push("", "### 헷갈리는 개념", ...c.confusingConcepts.map((e) => `- [[${e}]]`));
  if (c.relatedQuestions && c.relatedQuestions.length)
    parts.push("", "### 관련 질문", ...c.relatedQuestions.map((q) => `- ${q}`));
  return parts.join("\n");
}

function conceptMarkdown(c: LlmConcept, source: ImportSource): string {
  return `# ${c.title}\n\n${sourceBlock(c, source)}`;
}

/** 기존 본문 보존 + 이 노트 블록 추가. 같은 노트의 블록이 이미 있으면 그것만 교체. */
export function appendConceptBlock(existingMd: string, c: LlmConcept, source: ImportSource): string {
  const block = sourceBlock(c, source);
  const mark = srcMark(source.sourceId);
  const start = existingMd.indexOf(mark);
  if (start < 0) return `${existingMd.trimEnd()}\n\n${block}\n`;
  const next = existingMd.indexOf("<!-- src:", start + mark.length);
  const tail = next < 0 ? "" : `\n\n${existingMd.slice(next).trimStart()}`;
  return `${existingMd.slice(0, start).trimEnd()}\n\n${block}${tail}\n`;
}

// 노트 본문의 첫 pdf/image embed → LlmWikiInput.sourceFiles.
// 이걸 입력에 넣어야 sanitizeSourceRefs(validate.ts)가 LLM 의 sourceRefs 를 살려서 통과시킨다 —
// 비우면 모든 ref 가 환각으로 간주되어 제거되고 sourceRefs 파이프라인 전체가 no-op 이 된다.
// sanitize 가 sourceId→file 1:1 맵을 쓰므로 노트당 대표 파일 1개만 준다.
export function embedSourceFiles(sourceId: string, markdown: string): NonNullable<LlmWikiInput["sourceFiles"]> {
  const e = firstEmbedFile(markdown);
  return e ? [{ id: sourceId, file: e.file, type: e.type }] : [];
}

// LlmSourceRef → SourceRef (llm-output-schema 변환 파이프라인 · 수용기준 §2.2).
// sourceId 는 LLM 입력으로 준 Source 만 허용(환각 거부) — save_wiki 의 frontmatter 검증을 통과 보장.
// 병합 시 기존 refs 와 (sourceId,file,page,embed) 기준 dedup.
export function toSourceRefs(c: LlmConcept, allowed: Set<string>, baseSlug: string, existing?: SourceRef[]): SourceRef[] {
  const out: SourceRef[] = existing ? [...existing] : [];
  const key = (r: { sourceId: string; file: string; page?: number; embed: boolean }) =>
    `${r.sourceId}|${r.file}|${r.page ?? ""}|${r.embed}`;
  const seen = new Set(out.map(key));
  let i = out.length;
  for (const r of c.sourceRefs ?? []) {
    if (!allowed.has(r.sourceId) || !r.file) continue;
    const k = key(r);
    if (seen.has(k)) continue;
    seen.add(k);
    out.push({ id: `ref-${baseSlug}-${i++}`, sourceId: r.sourceId, file: r.file, page: r.page, embed: r.embed, label: r.label, reason: r.reason });
  }
  return out;
}

// ── 정리 글(합성) 페이지 — ADR-0008 / docs/30-llm/note-synthesis.md §6 ──────────────
// 정체성(conceptId/path/id/title)은 노트 sourceId 에서 결정적으로 파생 — LLM 이 소유하지 않는다.
// 재변환 = 같은 파일 갱신(제목 드리프트 무관), "syn-" 접두사로 추출 개념과 네임스페이스 분리.
const SYN_CONCEPT_PREFIX = "concept-syn-";

export function isSynthesisPage(p: WikiPage): boolean {
  return p.conceptId.startsWith(SYN_CONCEPT_PREFIX);
}

export function synthesisConceptId(sourceId: string): string {
  return `${SYN_CONCEPT_PREFIX}${sourceId}`;
}

export function synthesisPage(spaceId: string, note: ArchiveNote, markdown: string, existing: WikiPage[]): WikiPage {
  const now = new Date().toISOString();
  const conceptId = synthesisConceptId(note.sourceId);
  const ex = existing.find((p) => p.conceptId === conceptId);
  // 본문 embed → sourceRefs — 비우면 frontmatter↔본문 embed 충돌 배너가 뜬다(sourceRefConflicts).
  const refs: SourceRef[] = [];
  const seen = new Set<string>();
  for (const t of parseWikilinks(markdown)) {
    if (t.kind !== "embed") continue;
    const { file, page } = parseEmbedTarget(t.value);
    const k = `${file}|${page ?? ""}`;
    if (!file || seen.has(k)) continue;
    seen.add(k);
    refs.push({ id: `ref-syn-${refs.length}`, sourceId: note.sourceId, file, page, embed: true });
  }
  return {
    id: ex?.id ?? `wiki-syn-${note.sourceId}`,
    spaceId,
    conceptId,
    title: `${note.title} 정리`,
    path: ex?.path ?? `syn-${note.sourceId}.md`,
    subjectIds: note.subjectIds,
    sourceIds: [note.sourceId],
    sourceRefs: refs,
    markdown,
    createdAt: ex?.createdAt ?? now, // 재변환 시 생성시각 보존
    updatedAt: now,
  };
}

// 기존 위키 → LlmWikiInput.existingConcepts.
// normalizedTitle 은 반드시 normalizeTitle 규칙이어야 한다 — validate.normTitle 이 관계의
// 제목을 같은 규칙으로 정규화해 known 집합과 대조하므로, 규칙이 어긋나면 그 개념으로 향하는
// 관계가 전부 droppedTitle 로 조용히 사라진다.
export function toExistingConcepts(pages: WikiPage[]): NonNullable<LlmWikiInput["existingConcepts"]> {
  return pages
    .filter((w) => !isSynthesisPage(w)) // 정리 글은 개념이 아니다 — 중복 힌트에서 제외
    .map((w) => ({ id: w.conceptId, title: w.title, normalizedTitle: normalizeTitle(w.title) }));
}

function toEvidence(e: LlmEvidence): Evidence {
  return {
    sourceId: e.sourceId,
    archivePath: e.archivePath,
    originalFilePath: e.originalFilePath,
    page: e.page,
    quote: e.quote,
    location: e.location,
    reason: e.reason,
  };
}

export interface ApplyResult {
  pages: WikiPage[];
  relationCount: number;
  merged: number;
}

/** source = 이 위키/관계를 만든 원본 노트(evidence 근거). existing = 현재 공간의 위키(dedup 대상). */
export async function applyLlmResult(
  space: string,
  spaceId: string,
  subjectIds: string[],
  result: LlmWikiResult,
  source: ImportSource,
  existing: WikiPage[],
): Promise<ApplyResult> {
  const now = new Date().toISOString();
  const byNorm = new Map<string, WikiPage>();
  // 합성(정리 글) 페이지는 병합 대상에서 제외 — 제목이 우연히 겹치면 conceptMarkdown 이 정리 글 본문을 덮어쓴다(클로버 가드).
  for (const p of existing) if (!isSynthesisPage(p)) byNorm.set(normalizeTitle(p.title), p);

  const conceptMap = new Map<string, string>(); // normalizedTitle → conceptId
  const pages: WikiPage[] = [];
  let merged = 0;

  for (const c of result.concepts) {
    const norm = normalizeTitle(c.title);
    const ex = byNorm.get(norm); // 기존과 동일 개념이면 그 파일에 병합
    if (ex) merged++;
    const cid = ex ? ex.conceptId : `concept-${slugOrHash(c.title)}`;
    // 허용 sourceId = 이번 입력 소스 ∪ 기존 페이지가 이미 참조하던 소스
    const allowed = new Set([source.sourceId, ...(ex?.sourceIds ?? [])]);
    const page: WikiPage = {
      id: ex ? ex.id : `wiki-${slugOrHash(c.title)}`,
      spaceId,
      conceptId: cid,
      title: c.title,
      path: ex ? ex.path : `${slugOrHash(c.title)}.md`,
      subjectIds: ex ? Array.from(new Set([...ex.subjectIds, ...subjectIds])) : subjectIds,
      sourceIds: ex ? Array.from(new Set([...ex.sourceIds, source.sourceId])) : [source.sourceId],
      sourceRefs: toSourceRefs(c, allowed, slugOrHash(c.title), ex?.sourceRefs),
      // 병합이면 기존 본문을 보존한 채 이 노트 블록만 얹는다 — 지식 축적.
      markdown: ex ? appendConceptBlock(ex.markdown, c, source) : conceptMarkdown(c, source),
      createdAt: ex ? ex.createdAt : now, // 병합 시 생성시각 보존
      updatedAt: now,
    };
    pages.push(page);
    conceptMap.set(norm, cid);
  }
  for (const p of pages) await ipc.saveWiki(space, p);

  // 관계: 개념 제목 → conceptId (이번 결과 ∪ 기존). 미해결이면 스킵.
  const resolve = (title: string): string | null => {
    const norm = normalizeTitle(title);
    return conceptMap.get(norm) ?? byNorm.get(norm)?.conceptId ?? null;
  };
  const relations: Relation[] = [];
  result.relations.forEach((r, i) => {
    const s = resolve(r.sourceConceptTitle);
    const t = resolve(r.targetConceptTitle);
    if (!s || !t) return;
    // 모든 관계는 evidence ≥ 1 — LLM evidence 있으면 관통, 없으면 원본 노트 근거로 합성.
    const evidence: Evidence[] =
      r.evidence && r.evidence.length
        ? r.evidence.map(toEvidence)
        : [{ sourceId: source.sourceId, archivePath: source.archivePath, reason: r.explanation || "원본 노트 근거" }];
    relations.push({
      id: `rel-${slugOrHash(r.sourceConceptTitle + r.targetConceptTitle)}-${i}`,
      spaceId,
      sourceNodeId: s,
      targetNodeId: t,
      relationType: r.relationType as Relation["relationType"],
      strength: r.strength,
      confidence: r.confidence,
      explanation: r.explanation,
      evidence,
      createdAt: now,
      updatedAt: now,
    });
  });
  const relationCount = relations.length ? await ipc.appendRelations(space, relations) : 0;

  return { pages, relationCount, merged };
}
