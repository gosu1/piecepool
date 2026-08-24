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
  /** get_graph 파생 우선도 0~1 (prioritization.md §5). 노드 크기/라벨 노출 구동. */
  priority?: number;
  /** 소속 KnowledgeSpace slug. 병합(전체 과목) 뷰에서 색·필터·문서 열기 정합성용.
   * get_graph 응답엔 없고 프론트 병합 시 태깅한다(파일명 concept-slug.md 가 space 간 충돌하므로 필수). */
  space?: string;
}

export interface GraphData {
  nodes: GraphNode[];
  relations: Relation[];
}

// ── 이해 상태 사이드카 (get_understanding / set_understanding 응답) ──
// <space>/config/understanding.json — 파생 상태라 entities 계약이 아니다(GraphNode 전례).
// 맵에 키가 없는 개념 = hazy(안개)가 기본값.

export type UnderstandingState = "hazy" | "clear";

export interface UnderstandingEntry {
  state: UnderstandingState;
  updatedAt: string;
}

/** conceptId → 항목 */
export type UnderstandingMap = Record<string, UnderstandingEntry>;

// ── 쿼리바 대화 기록 (list/read/save/delete_query_session 응답) ──
// `queries/sessions/<id>.json` — 대화 1건 = 파일 1개. 계약: workspace-layout.md §3.10.
// 파생 상태라 entities 계약이 아니다(UnderstandingEntry 전례).

export interface QuerySessionTurn {
  role: "user" | "assistant";
  text: string;
  at: string;
  /** 이 답을 만들며 실제로 열어 본 위키 — "폴더/파일명" 꼴. 사용자 말에는 없다. */
  citedWiki?: string[];
}

export interface QuerySession {
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
  turns: QuerySessionTurn[];
}

/** 목록용 요약 — 본문(turns)을 안 싣는다. 목록이 커져도 가볍다. */
export interface QuerySessionMeta {
  id: string;
  title: string;
  updatedAt: string;
  turnCount: number;
}
