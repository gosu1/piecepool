// 엔티티 TS 타입 배럴. ts-rs 생성물(./generated/*.ts) 재노출.
// SSOT: docs/10-contracts/entities.md, relation-types.md → src-tauri/src/models/mod.rs.
// generated/ 는 자동 생성 — 수동 편집 금지. 갱신: npm run gen:types.

export type { Workspace } from "./generated/Workspace";
export type { KnowledgeSpace } from "./generated/KnowledgeSpace";
export type { Subject } from "./generated/Subject";
export type { Source } from "./generated/Source";
export type { SourceType } from "./generated/SourceType";
export type { ArchiveNote } from "./generated/ArchiveNote";
export type { Concept } from "./generated/Concept";
export type { SourceRef } from "./generated/SourceRef";
export type { WikiPage } from "./generated/WikiPage";
export type { Evidence } from "./generated/Evidence";
export type { Relation } from "./generated/Relation";
export type { RelationType } from "./generated/RelationType";
export type { Question } from "./generated/Question";
export type { ImportJob } from "./generated/ImportJob";
export type { ImportJobStatus } from "./generated/ImportJobStatus";
export type { PdfExtractResult } from "./generated/PdfExtractResult";
export type { PageText } from "./generated/PageText";

// ── Command DTO (ts-rs 미생성, get_graph 응답) ──
import type { Relation } from "./generated/Relation";

export interface GraphNode {
  id: string;
  title: string;
  kind: "core" | "result";
  subjectIds: string[];
  path: string;
  /** 소속 KnowledgeSpace slug. 병합(전체 과목) 뷰에서 색·필터·문서 열기 정합성용.
   * get_graph 응답엔 없고 프론트 병합 시 태깅한다(파일명 concept-slug.md 가 space 간 충돌하므로 필수). */
  space?: string;
}

export interface GraphData {
  nodes: GraphNode[];
  relations: Relation[];
}
