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
} from "./types";
import { mock } from "./mockIpc";

// Tauri command 타입 래퍼. 백엔드 src-tauri/src/commands/* 와 1:1.
// Tauri 안이면 실제 invoke, 브라우저(vite preview)면 mock 데이터로 폴백(UI 확인용).
const inTauri = typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;

const real = {
  getWorkspace: () => invoke<Workspace>("get_workspace"),
  listSpaces: () => invoke<KnowledgeSpace[]>("list_spaces"),
  listSubjects: (space: string) => invoke<Subject[]>("list_subjects", { space }),
  listSources: (space: string) => invoke<string[]>("list_sources", { space }),
  extractPdfText: (space: string, file: string) => invoke<PdfExtractResult>("extract_pdf_text", { space, file }),
  readFileBytes: (space: string, file: string) => invoke<string>("read_file_bytes", { space, file }),
  listNotes: (space: string) => invoke<ArchiveNote[]>("list_notes", { space }),
  readNote: (space: string, file: string) => invoke<ArchiveNote>("read_note", { space, file }),
  createNote: (space: string, title: string, markdown: string, subjectIds: string[]) =>
    invoke<ArchiveNote>("create_note", { space, title, markdown, subjectIds }),
  saveNote: (space: string, file: string, markdown: string) => invoke<ArchiveNote>("save_note", { space, file, markdown }),
  listWiki: (space: string) => invoke<WikiPage[]>("list_wiki", { space }),
  readWiki: (space: string, file: string) => invoke<WikiPage>("read_wiki", { space, file }),
  saveWiki: (space: string, page: WikiPage) => invoke<WikiPage>("save_wiki", { space, page }),
  getGraph: (space: string) => invoke<GraphData>("get_graph", { space }),
  appendRelations: (space: string, relations: Relation[]) => invoke<number>("append_relations", { space, relations }),
};

const api = inTauri ? real : mock;

export const getWorkspace = api.getWorkspace;
export const listSpaces = api.listSpaces;
export const listSubjects = api.listSubjects;
export const listSources = api.listSources;
export const extractPdfText = api.extractPdfText;
export const readFileBytes = api.readFileBytes;
export const listNotes = api.listNotes;
export const readNote = api.readNote;
export const createNote = api.createNote;
export const saveNote = api.saveNote;
export const listWiki = api.listWiki;
export const readWiki = api.readWiki;
export const saveWiki = api.saveWiki;
export const getGraph = api.getGraph;
export const appendRelations = api.appendRelations;
