import { invoke } from "@tauri-apps/api/core";
import type {
  Workspace,
  KnowledgeSpace,
  Subject,
  ArchiveNote,
  WikiPage,
  Relation,
  GraphData,
  PdfExtractResult,
  SourceType,
  UnderstandingMap,
  UnderstandingState,
  QuerySession,
  QuerySessionMeta,
} from "./types";
import { mock } from "./mockIpc";
import { inTauri } from "./platform";

// Tauri command 타입 래퍼. 백엔드 src-tauri/src/commands/* 와 1:1.
// Tauri 안이면 실제 invoke, 브라우저(vite preview)면 mock 데이터로 폴백(UI 확인용).

const real = {
  getWorkspace: () => invoke<Workspace>("get_workspace"),
  listSpaces: () => invoke<KnowledgeSpace[]>("list_spaces"),
  createSpace: (name: string) => invoke<KnowledgeSpace>("create_space", { name }),
  renameSpace: (slug: string, newName: string) => invoke<KnowledgeSpace>("rename_space", { slug, newName }),
  deleteSpace: (slug: string) => invoke<void>("delete_space", { slug }),
  listSubjects: (space: string) => invoke<Subject[]>("list_subjects", { space }),
  listSources: (space: string) => invoke<string[]>("list_sources", { space }),
  extractPdfText: (space: string, file: string) => invoke<PdfExtractResult>("extract_pdf_text", { space, file }),
  readFileBytes: (space: string, file: string) => invoke<string>("read_file_bytes", { space, file }),
  listNotes: (space: string) => invoke<ArchiveNote[]>("list_notes", { space }),
  listSourceTypes: (space: string) => invoke<[string, SourceType][]>("list_source_types", { space }),
  readNote: (space: string, file: string) => invoke<ArchiveNote>("read_note", { space, file }),
  createNote: (space: string, title: string, markdown: string, subjectIds: string[]) =>
    invoke<ArchiveNote>("create_note", { space, title, markdown, subjectIds }),
  saveNote: (space: string, file: string, markdown: string, title?: string) =>
    invoke<ArchiveNote>("save_note", { space, file, markdown, title }),
  moveNote: (space: string, file: string, toSpace: string) => invoke<ArchiveNote>("move_note", { space, file, toSpace }),
  deleteNote: (space: string, file: string) => invoke<void>("delete_note", { space, file }),
  renameNote: (space: string, file: string, newTitle: string) => invoke<ArchiveNote>("rename_note", { space, file, newTitle }),
  updateNoteSubjects: (space: string, file: string, subjectIds: string[]) =>
    invoke<ArchiveNote>("update_note_subjects", { space, file, subjectIds }),
  listWiki: (space: string) => invoke<WikiPage[]>("list_wiki", { space }),
  readWiki: (space: string, file: string) => invoke<WikiPage>("read_wiki", { space, file }),
  saveWiki: (space: string, page: WikiPage) => invoke<WikiPage>("save_wiki", { space, page }),
  // 임포트 writing 단계 전용 — 페이지마다 save_wiki 를 부르면 백엔드가 매번 archive 전체를 재스캔한다.
  saveWikiBatch: (space: string, pages: WikiPage[]) => invoke<WikiPage[]>("save_wiki_batch", { space, pages }),
  deleteWiki: (space: string, file: string) => invoke<number>("delete_wiki", { space, file }),
  renameWiki: (space: string, file: string, newTitle: string) => invoke<WikiPage>("rename_wiki", { space, file, newTitle }),
  saveSourceFile: (space: string, name: string, dataBase64: string) => invoke<string>("save_source_file", { space, name, dataBase64 }),
  deleteSource: (space: string, file: string) => invoke<void>("delete_source", { space, file }),
  moveSource: (fromSpace: string, toSpace: string, file: string) =>
    invoke<string>("move_source", { fromSpace, toSpace, file }),
  getGraph: (space: string) => invoke<GraphData>("get_graph", { space }),
  appendRelations: (space: string, relations: Relation[]) => invoke<number>("append_relations", { space, relations }),
  // 사용자 전용 — review_needed self-loop. append_relations 는 이 타입을 거부한다(계약).
  markReviewNeeded: (space: string, conceptId: string, sourceId: string, quotes: string[]) =>
    invoke<number>("mark_review_needed", { space, conceptId, sourceId, quotes }),
  unmarkReviewNeeded: (space: string, conceptId: string) =>
    invoke<number>("unmark_review_needed", { space, conceptId }),
  openQueryWindow: () => invoke<void>("open_query_window"),
  listQuerySessions: () => invoke<QuerySessionMeta[]>("list_query_sessions"),
  readQuerySession: (id: string) => invoke<QuerySession>("read_query_session", { id }),
  saveQuerySession: (session: QuerySession) => invoke<QuerySession>("save_query_session", { session }),
  deleteQuerySession: (id: string) => invoke<void>("delete_query_session", { id }),
  getUnderstanding: (space: string) => invoke<UnderstandingMap>("get_understanding", { space }),
  setUnderstanding: (space: string, conceptId: string, state: UnderstandingState) =>
    invoke<UnderstandingMap>("set_understanding", { space, conceptId, state }),
};

const api = inTauri ? real : mock;

export const {
  openQueryWindow,
  listQuerySessions,
  readQuerySession,
  saveQuerySession,
  deleteQuerySession,
  getWorkspace,
  listSpaces,
  createSpace,
  renameSpace,
  deleteSpace,
  listSubjects,
  listSources,
  extractPdfText,
  readFileBytes,
  listNotes,
  listSourceTypes,
  readNote,
  createNote,
  saveNote,
  moveNote,
  deleteNote,
  renameNote,
  updateNoteSubjects,
  listWiki,
  readWiki,
  saveWiki,
  saveWikiBatch,
  deleteWiki,
  renameWiki,
  saveSourceFile,
  deleteSource,
  moveSource,
  getGraph,
  appendRelations,
  markReviewNeeded,
  unmarkReviewNeeded,
  getUnderstanding,
  setUnderstanding,
} = api;
