// 엔티티 TS 타입. SSOT: docs/10-contracts/entities.md — 본 파일은 미러다.
// 드리프트 방지: 향후 ts-rs로 src-tauri/src/models 에서 자동 생성 권장.

// docs/10-contracts/entities.md#workspace
export type Workspace = {
  id: string;
  name: string;
  rootPath: string;
  createdAt: string;
  updatedAt: string;
};

// TODO: KnowledgeSpace, Subject, Source, ArchiveNote, Concept, WikiPage,
//       SourceRef, Evidence, Question, ImportJob — entities.md 참조.
