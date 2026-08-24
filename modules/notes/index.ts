// Public API of the notes module. Import only from here.
export {
  getNoteDocument,
  getNoteRefs,
  getStandaloneNote,
  listNotes,
  ensureLectureNote,
  createStandaloneNote,
  saveNoteDocument,
} from './service';
export {
  noteNodeSchema,
  saveNoteInputSchema,
  standaloneNoteSchema,
  createStandaloneNoteInputSchema,
  type NoteNode,
  type NoteDocument,
  type NoteListEntry,
  type NoteRef,
  type StandaloneNote,
  type CreateStandaloneNoteInput,
  type SaveNoteInput,
} from './schema';
