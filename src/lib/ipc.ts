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
} from "./types";
import { mock } from "./mockIpc";
import { inTauri } from "./platform";

// Tauri command 타입 래퍼. 백엔드 src-tauri/src/commands/* 와 1:1.
// Tauri 안이면 실제 invoke, 브라우저(vite preview)면 mock 데이터로 폴백(UI 확인용).

const real = {
  getWorkspace: () => invoke<Workspace>("get_workspace"),
  listSpaces: () => invoke<KnowledgeSpace[]>("list_spaces"),
  createSpace: (name: string) => invoke<KnowledgeSpace>("create_space", { name }),
  listSubjects: (space: string) => invoke<Subject[]>("list_subjects", { space }),
  listSources: (space: string) => invoke<string[]>("list_sources", { space }),
  extractPdfText: (space: string, file: string) => invoke<PdfExtractResult>("extract_pdf_text", { space, file }),
  readFileBytes: (space: string, file: string) => invoke<string>("read_file_bytes", { space, file }),
  listNotes: (space: string) => invoke<ArchiveNote[]>("list_notes", { space }),
  listSourceTypes: (space: string) => invoke<[string, SourceType][]>("list_source_types", { space }),
  readNote: (space: string, file: string) => invoke<ArchiveNote>("read_note", { space, file }),
  createNote: (space: string, title: string, markdown: string, subjectIds: string[]) =>
    invoke<ArchiveNote>("create_note", { space, title, markdown, subjectIds }),
  saveNote: (space: string, file: string, markdown: string) => invoke<ArchiveNote>("save_note", { space, file, markdown }),
  moveNote: (space: string, file: string, toSpace: string) => invoke<ArchiveNote>("move_note", { space, file, toSpace }),
  deleteNote: (space: string, file: string) => invoke<void>("delete_note", { space, file }),
  renameNote: (space: string, file: string, newTitle: string) => invoke<ArchiveNote>("rename_note", { space, file, newTitle }),
  listWiki: (space: string) => invoke<WikiPage[]>("list_wiki", { space }),
  readWiki: (space: string, file: string) => invoke<WikiPage>("read_wiki", { space, file }),
  saveWiki: (space: string, page: WikiPage) => invoke<WikiPage>("save_wiki", { space, page }),
  deleteWiki: (space: string, file: string) => invoke<number>("delete_wiki", { space, file }),
  renameWiki: (space: string, file: string, newTitle: string) => invoke<WikiPage>("rename_wiki", { space, file, newTitle }),
  saveSourceFile: (space: string, name: string, dataBase64: string) => invoke<string>("save_source_file", { space, name, dataBase64 }),
  deleteSource: (space: string, file: string) => invoke<void>("delete_source", { space, file }),
  getGraph: (space: string) => invoke<GraphData>("get_graph", { space }),
  appendRelations: (space: string, relations: Relation[]) => invoke<number>("append_relations", { space, relations }),
};

const api = inTauri ? real : mock;

export const getWorkspace = api.getWorkspace;
export const listSpaces = api.listSpaces;
export const createSpace = api.createSpace;
export const listSubjects = api.listSubjects;
export const listSources = api.listSources;
export const extractPdfText = api.extractPdfText;
export const readFileBytes = api.readFileBytes;
export const listNotes = api.listNotes;
export const listSourceTypes = api.listSourceTypes;
export const readNote = api.readNote;
export const createNote = api.createNote;
export const saveNote = api.saveNote;
export const moveNote = api.moveNote;
export const deleteNote = api.deleteNote;
export const renameNote = api.renameNote;
export const listWiki = api.listWiki;
export const readWiki = api.readWiki;
export const saveWiki = api.saveWiki;
export const deleteWiki = api.deleteWiki;
export const renameWiki = api.renameWiki;
export const saveSourceFile = api.saveSourceFile;
export const deleteSource = api.deleteSource;
export const getGraph = api.getGraph;
export const appendRelations = api.appendRelations;
