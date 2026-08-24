// Public API of the notes module. Import only from here.
export {
  getNoteDocument,
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
  type StandaloneNote,
  type CreateStandaloneNoteInput,
  type SaveNoteInput,
} from './schema';
