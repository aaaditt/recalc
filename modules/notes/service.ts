import { randomUUID } from 'node:crypto';

import type { SupabaseClient } from '@supabase/supabase-js';

import { localDateKey, localTimeZone } from '@/lib/time';
import {
  createBlock,
  getBlock,
  getBlocks,
  getChildBlocks,
  moveBlock,
  softDeleteBlock,
  updateBlock,
  type Block,
  type BlockType,
} from '@/modules/blocks';
import {
  getCourse,
  getMeeting,
  getMeetingsWithNotes,
  getSyllabusUnits,
  setMeetingNote,
} from '@/modules/courses';

import * as repo from './repo';
import {
  createStandaloneNoteInputSchema,
  noteNodeSchema,
  saveNoteInputSchema,
  type CreateStandaloneNoteInput,
  type NoteDocument,
  type NoteListEntry,
  type NoteNode,
  type StandaloneNote,
} from './schema';

// A note document is one `blocks` row of type 'note'; each top-level node of
// the TipTap document is a child block of it.
//
// Every write of note content in the app goes through here, and everything
// here goes through the blocks module — never a direct UPDATE. That is what
// keeps `version` and `content_hash` honest, and the staleness cascade with
// them (CLAUDE.md, Never rule 5).

// ---------------------------------------------------------------------------
// Shapes
// ---------------------------------------------------------------------------

/** A note document's own content is its title, in the plain `{ text }` shape. */
function titleOf(doc: Block): string {
  return typeof doc.content.text === 'string' ? doc.content.text : '';
}

/**
 * Which `blocks.type` a TipTap node is stored as. Only headings get their own
 * type — a paragraph, a list and a divider are all just text in a document,
 * and the node's own JSON says which. Type is not part of the hash, so
 * toggling a paragraph into a heading never bumps a version.
 */
function blockTypeFor(node: NoteNode): BlockType {
  return node.type === 'heading' ? 'heading' : 'text';
}

/** The node as it is stored: carrying the id of the row it lives in. */
function withBlockId(node: NoteNode, blockId: string): NoteNode {
  return { ...node, attrs: { ...(node.attrs ?? {}), blockId } };
}

function nodeOf(block: Block): NoteNode {
  const parsed = noteNodeSchema.safeParse(block.content);
  // A child that is not a TipTap node cannot happen through the editor, but a
  // note is a block and blocks can be written by other things later. An empty
  // paragraph is a truthful stand-in and keeps the document openable.
  return withBlockId(parsed.success ? parsed.data : { type: 'paragraph' }, block.id);
}

/**
 * Whether two node JSONs are the same document node.
 *
 * jsonb does not preserve key order, so the copy that comes back from Postgres
 * cannot be compared to the editor's copy with plain JSON.stringify. Sorting
 * the keys on the way out makes the comparison stable. A wrong answer here
 * only costs a redundant UPDATE — it can never bump a version, because the
 * version is decided by the content hash inside blocks.service.
 */
function stableJson(value: unknown): string {
  return JSON.stringify(value, (_key, entry) => {
    if (entry === null || typeof entry !== 'object' || Array.isArray(entry)) return entry;
    const record = entry as Record<string, unknown>;
    return Object.fromEntries(Object.keys(record).sort().map((key) => [key, record[key]]));
  });
}

// ---------------------------------------------------------------------------
// Reads
// ---------------------------------------------------------------------------

/** One note document with its nodes in order, or null if it is not ours. */
export async function getNoteDocument(
  db: SupabaseClient,
  workspaceId: string,
  docId: string
): Promise<NoteDocument | null> {
  const doc = await getBlock(db, docId);
  if (!doc || doc.workspace_id !== workspaceId || doc.type !== 'note') return null;
  if (doc.deleted_at !== null) return null;

  const children = await getChildBlocks(db, doc.id);
  return { id: doc.id, title: titleOf(doc), nodes: children.map(nodeOf) };
}

/**
 * The index entry for a free-standing note, or null when this document is a
 * lecture's note (or nothing at all).
 */
export async function getStandaloneNote(
  db: SupabaseClient,
  workspaceId: string,
  docId: string
): Promise<StandaloneNote | null> {
  const note = await repo.findStandaloneByBlock(db, docId);
  return note && note.workspace_id === workspaceId ? note : null;
}

/**
 * Every note in the workspace, newest first.
 *
 * Two sources, because there are two kinds of note and each is authoritative
 * about itself: a lecture note is named by `class_meetings.note_block_id`, and
 * a free-standing note is indexed in `standalone_notes`. Nothing is written
 * twice, so the two can never disagree.
 */
export async function listNotes(
  db: SupabaseClient,
  workspaceId: string,
  timeZone: string = localTimeZone()
): Promise<NoteListEntry[]> {
  const [meetings, standalone] = await Promise.all([
    getMeetingsWithNotes(db, workspaceId),
    repo.listStandalone(db, workspaceId),
  ]);

  const blockIds = [
    ...meetings.flatMap((meeting) => (meeting.note_block_id ? [meeting.note_block_id] : [])),
    ...standalone.map((note) => note.block_id),
  ];
  const docs = await getBlocks(db, blockIds);
  const live = new Map(docs.filter((doc) => doc.deleted_at === null).map((d) => [d.id, d]));

  const entries: NoteListEntry[] = [];

  for (const meeting of meetings) {
    const doc = meeting.note_block_id ? live.get(meeting.note_block_id) : undefined;
    if (!doc) continue;
    entries.push({
      blockId: doc.id,
      title: titleOf(doc),
      courseId: meeting.course_id,
      meetingId: meeting.id,
      date: localDateKey(new Date(meeting.starts_at), timeZone),
      at: meeting.starts_at,
      href: `/lecture/${meeting.id}`,
    });
  }

  for (const note of standalone) {
    const doc = live.get(note.block_id);
    if (!doc) continue;
    entries.push({
      blockId: doc.id,
      title: titleOf(doc),
      courseId: note.course_id,
      meetingId: null,
      date: null,
      at: note.created_at,
      href: `/notes/${doc.id}`,
    });
  }

  return entries.sort((a, b) => (a.at < b.at ? 1 : a.at > b.at ? -1 : 0));
}

// ---------------------------------------------------------------------------
// Writes
// ---------------------------------------------------------------------------

/**
 * The note document for a lecture, created the first time anything is saved
 * into it.
 *
 * It is created on the first *save* rather than on the first render, because a
 * render happens whenever the route is prefetched — hovering a link on the
 * calendar would otherwise leave empty notes behind on lectures never opened.
 */
export async function ensureLectureNote(
  db: SupabaseClient,
  workspaceId: string,
  meetingId: string
): Promise<string> {
  const meeting = await getMeeting(db, workspaceId, meetingId);
  if (!meeting) throw new Error(`ensureLectureNote: no meeting ${meetingId} here`);

  if (meeting.note_block_id) {
    const existing = await getBlock(db, meeting.note_block_id);
    if (existing) return existing.id;
  }

  // A lecture note's title is the lecture — code, date and time are already in
  // the page header — so the document itself carries an empty one.
  const doc = await createBlock(db, { workspaceId, type: 'note', content: { text: '' } });
  const attached = await setMeetingNote(db, workspaceId, meetingId, doc.id);
  return attached.note_block_id ?? doc.id;
}

/** A note with no lecture behind it: a formula sheet, a plan, a reading. */
export async function createStandaloneNote(
  db: SupabaseClient,
  input: CreateStandaloneNoteInput
): Promise<string> {
  const parsed = createStandaloneNoteInputSchema.parse(input);

  // courseId is client-supplied. workspaceId is not (every caller derives it
  // from the session), but without this check a forged courseId could index
  // a note under a course this workspace does not own — the standalone_notes
  // insert policy only validates workspace_id, not the course_id it references.
  const course = await getCourse(db, parsed.workspaceId, parsed.courseId);
  if (!course) {
    throw new Error(`createStandaloneNote: no course ${parsed.courseId} in this workspace`);
  }

  // A note filed under a unit of a different course is a note that will never
  // be found again.
  if (parsed.unitId) {
    const units = await getSyllabusUnits(db, parsed.courseId);
    if (!units.some((unit) => unit.id === parsed.unitId)) {
      throw new Error('createStandaloneNote: that unit belongs to a different course');
    }
  }

  const doc = await createBlock(db, {
    workspaceId: parsed.workspaceId,
    type: 'note',
    content: { text: parsed.title },
  });

  await repo.insertStandalone(db, {
    workspace_id: parsed.workspaceId,
    block_id: doc.id,
    course_id: parsed.courseId,
    unit_id: parsed.unitId ?? null,
  });

  return doc.id;
}

/**
 * Save the whole document. The editor sends every top-level node in order,
 * each carrying the block id it belongs to, and this reconciles them:
 *
 *   a node with a known id      -> update that block. The hash decides whether
 *                                  the version moves, so bold, italic and a
 *                                  fixed space change nothing.
 *   a node whose index moved    -> position only. No version bump.
 *   a node with an unknown id   -> a new block, keeping the id the editor
 *                                  minted so nothing has to be handed back.
 *   a block with no node left   -> soft delete. The row stays; a derivation
 *                                  may still name it.
 */
export async function saveNoteDocument(
  db: SupabaseClient,
  workspaceId: string,
  docId: string,
  // `unknown` on purpose: this is reached from a server action, which is a
  // public endpoint. The schema below is the only thing that decides what a
  // document is allowed to contain.
  input: unknown
): Promise<NoteDocument> {
  const parsed = saveNoteInputSchema.parse(input);

  const doc = await getBlock(db, docId);
  if (!doc || doc.workspace_id !== workspaceId || doc.type !== 'note') {
    throw new Error(`saveNoteDocument: no note document ${docId} in this workspace`);
  }

  const existing = await getChildBlocks(db, doc.id);
  const byId = new Map(existing.map((block) => [block.id, block]));
  const kept = new Set<string>();
  const saved: NoteNode[] = [];

  for (const [index, node] of parsed.nodes.entries()) {
    // Document order, one-based. The editor always sends the whole document,
    // so the position of a node is simply where it is in it.
    const position = index + 1;
    const type = blockTypeFor(node);
    const claimed = node.attrs?.blockId ?? null;
    const current = claimed ? byId.get(claimed) : undefined;

    if (current) {
      kept.add(current.id);
      const wanted = withBlockId(node, current.id);

      if (current.type !== type || stableJson(current.content) !== stableJson(wanted)) {
        await updateBlock(db, current.id, { content: wanted, type });
      }
      if (current.position !== position) {
        await moveBlock(db, current.id, position);
      }

      saved.push(wanted);
      continue;
    }

    // The editor mints an id for every new node, so normally the id it claims
    // is free. It is only taken when a node was pasted in from another
    // document with its id still attached; then this save mints a fresh one
    // rather than reaching into someone else's block.
    const free = claimed !== null && (await getBlock(db, claimed)) === null;
    const id = free ? claimed : randomUUID();

    const created = await createBlock(db, {
      id,
      workspaceId,
      parentId: doc.id,
      type,
      content: withBlockId(node, id),
      position,
    });

    kept.add(created.id);
    saved.push(withBlockId(node, created.id));
  }

  for (const block of existing) {
    if (!kept.has(block.id)) await softDeleteBlock(db, block.id);
  }

  return { id: doc.id, title: titleOf(doc), nodes: saved };
}
