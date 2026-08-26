'use client';

// The editor. TipTap over blocks: one top-level node, one `blocks` row.
//
// 'use client' because a text editor is the definition of interactivity. It is
// still a leaf: it takes its document and a save function as props, holds no
// knowledge of lectures, courses or the database, and hands the server plain
// JSON.
//
// Typing must stay smooth, so nothing is saved on a keystroke. Changes are
// collected and written once the typing stops, and again on blur and on the
// way off the page.

import { EditorContent, useEditor, type Editor, type JSONContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import { useCallback, useEffect, useRef, useState } from 'react';

import { BlockId } from '@/components/notes/block-id';
import {
  TaskFromSelection,
  type SelectionTask,
} from '@/components/tasks/task-from-selection';
import { cx } from '@/lib/cx';

/** Long enough to type a sentence through, short enough to feel saved. */
const SAVE_DEBOUNCE_MS = 900;

type Status = 'clean' | 'unsaved' | 'saving' | 'error';

const STATUS_LABEL: Record<Status, string> = {
  clean: 'Saved',
  unsaved: 'Unsaved',
  saving: 'Saving…',
  error: 'Not saved',
};

type NoteEditorProps = {
  /** Null for a lecture note that has never been written in. */
  docId: string | null;
  /** The document's top-level TipTap nodes, in order. */
  nodes: unknown[];
  /** Returns the document's id, which is how a first save names a new note. */
  save: (docId: string | null, nodes: unknown[]) => Promise<{ docId: string }>;
  /**
   * Turn the selected sentence into a task. Omit it and the button is not
   * drawn — the editor still knows nothing about courses or lectures; it hands
   * back the words and the id of the block they are in, and the page it is on
   * fills in the rest.
   */
  makeTask?: (input: {
    title: string;
    sourceBlockId: string | null;
    dueAt: string | null;
  }) => Promise<void>;
  /**
   * Store an image pasted or dropped into the note. Omit it and pasting an
   * image does nothing, exactly as it did before slice 09.
   *
   * The editor still knows nothing about files, Drive or the database: it hands
   * over a FormData with one `image` field and says where it went. Small images
   * go to Supabase Storage rather than Drive (prompts/09-drive.md point 6) —
   * that routing is decided server-side, in lib/files.ts.
   */
  saveImage?: (formData: FormData) => Promise<void>;
};

export function NoteEditor({ docId, nodes, save, makeTask, saveImage }: NoteEditorProps) {
  const [status, setStatus] = useState<Status>('clean');
  // What just happened to a pasted picture. One line, then it goes away.
  const [imageNote, setImageNote] = useState<string | null>(null);
  // Non-empty while there is text selected, so the "Task" button knows whether
  // it has anything to work on.
  const [selected, setSelected] = useState('');
  const [selection, setSelection] = useState<SelectionTask | null>(null);

  const docIdRef = useRef(docId);

  // The save function is a server action bound to this page. It is held in a
  // ref so the debounce timer that fires a second after the last keystroke
  // always calls the current one, without the editor being rebuilt.
  const saveRef = useRef(save);
  useEffect(() => {
    saveRef.current = save;
  }, [save]);

  // What is waiting to be written, and whether a write is already in the air.
  const pending = useRef<JSONContent[] | null>(null);
  const inFlight = useRef(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const flush = useCallback(async () => {
    if (inFlight.current) return;
    const document = pending.current;
    if (!document) return;

    pending.current = null;
    inFlight.current = true;
    setStatus('saving');

    try {
      const result = await saveRef.current(docIdRef.current, document);
      docIdRef.current = result.docId;
      setStatus(pending.current ? 'unsaved' : 'clean');
    } catch {
      // Put it back: whatever went wrong, the words are still only here.
      pending.current = document;
      setStatus('error');
    } finally {
      inFlight.current = false;
    }
  }, []);

  const schedule = useCallback(
    (delay: number = SAVE_DEBOUNCE_MS) => {
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => {
        timer.current = null;
        void flush();
      }, delay);
    },
    [flush]
  );

  // The save function is held in a ref for the same reason `save` is: the
  // editor is built once, and the bound server action changes identity on
  // every render of the page above it.
  const saveImageRef = useRef(saveImage);
  useEffect(() => {
    saveImageRef.current = saveImage;
  }, [saveImage]);

  /**
   * A pasted or dropped picture.
   *
   * Returns true when it took the file, which is what stops ProseMirror also
   * inserting whatever it made of the clipboard.
   */
  const takeImages = useCallback((files: FileList | null | undefined): boolean => {
    const send = saveImageRef.current;
    if (!send || !files || files.length === 0) return false;

    const images = [...files].filter((file) => file.type.startsWith('image/'));
    if (images.length === 0) return false;

    setImageNote(images.length === 1 ? 'Saving image…' : `Saving ${images.length} images…`);

    void (async () => {
      try {
        for (const image of images) {
          const form = new FormData();
          form.set('image', image);
          await send(form);
        }
        setImageNote('Saved to this lecture’s files.');
      } catch {
        setImageNote('That image did not save. It may be too big for a note.');
      }
    })();

    return true;
  }, []);

  const editor = useEditor({
    // The server renders the page; the editor mounts after hydration.
    immediatelyRender: false,
    extensions: [
      // Paragraphs, headings, bullet and numbered lists, bold, italic, code
      // and a divider. The slice says nothing more, so nothing more is on.
      StarterKit.configure({
        blockquote: false,
        strike: false,
        underline: false,
        link: false,
      }),
      BlockId,
    ],
    content: {
      type: 'doc',
      content: nodes.length > 0 ? (nodes as JSONContent[]) : [{ type: 'paragraph' }],
    },
    editorProps: {
      attributes: { class: 'note-doc prose-note', spellcheck: 'true' },
      // A screenshot or a photo of the board, pasted or dragged straight into
      // the note. Returning true means ProseMirror leaves the clipboard alone.
      handlePaste: (_view, event) => takeImages(event.clipboardData?.files),
      handleDrop: (_view, event) =>
        takeImages((event as DragEvent).dataTransfer?.files),
    },
    onUpdate: ({ editor: current }) => {
      pending.current = current.getJSON().content ?? [];
      setStatus('unsaved');
      schedule();
    },
    onBlur: () => {
      if (pending.current) schedule(0);
    },
    onSelectionUpdate: ({ editor: current }) => {
      const { from, to } = current.state.selection;
      setSelected(from === to ? '' : current.state.doc.textBetween(from, to, ' '));
    },
  });

  /**
   * Open the sheet for whatever is selected.
   *
   * The pending save is flushed first, on purpose: a task made from a sentence
   * typed thirty seconds ago names a block that only exists once that save has
   * landed. Waiting for it is the difference between the link resolving and the
   * write being rejected.
   */
  const openTaskSheet = useCallback(async () => {
    if (!editor) return;

    const text = selected.trim();
    if (text === '') return;

    if (pending.current) await flush();

    const { state } = editor;
    const at = state.doc.resolve(state.selection.from);
    // depth 1 is the top-level node — the one that is a `blocks` row.
    const top = at.depth > 0 ? at.node(1) : null;
    const blockId = typeof top?.attrs?.blockId === 'string' ? top.attrs.blockId : null;

    setSelection({ title: text, blockId });
  }, [editor, flush, selected]);

  // Leaving the page — closing the tab, switching apps on a phone, or simply
  // navigating away — is the last chance to write what is still pending.
  useEffect(() => {
    function onHide() {
      if (document.visibilityState === 'hidden' && pending.current) void flush();
    }

    document.addEventListener('visibilitychange', onHide);
    return () => {
      document.removeEventListener('visibilitychange', onHide);
      if (timer.current) clearTimeout(timer.current);
      if (pending.current) void flush();
    };
  }, [flush]);

  return (
    <div className="flex flex-col">
      <div className="sticky top-0 z-10 flex items-center gap-1 border-b border-line bg-bg py-2">
        <Toolbar editor={editor} />

        {makeTask ? (
          <ToolButton
            label="＋ Task"
            title="Make a task from the selection"
            disabled={selected.trim() === ''}
            onClick={() => void openTaskSheet()}
          />
        ) : null}

        <span
          aria-live="polite"
          className={cx(
            'ml-auto font-mono text-label uppercase',
            status === 'error' ? 'text-accent' : 'text-faint'
          )}
        >
          {STATUS_LABEL[status]}
        </span>
      </div>

      <EditorContent editor={editor} />

      {imageNote ? (
        <p aria-live="polite" className="pt-2 text-12 text-muted">
          {imageNote}
        </p>
      ) : null}

      {makeTask ? (
        <TaskFromSelection
          selection={selection}
          onClose={() => setSelection(null)}
          create={makeTask}
        />
      ) : null}
    </div>
  );
}

// ---------------------------------------------------------------------------
// The toolbar. A laptop has the keyboard shortcuts; a phone has these.
// ---------------------------------------------------------------------------

function ToolButton({
  label,
  title,
  onClick,
  mono,
  disabled,
}: {
  label: string;
  title: string;
  onClick: () => void;
  mono?: boolean;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      title={title}
      aria-label={title}
      disabled={disabled}
      // The editor keeps the selection: pressing a toolbar button must not
      // take focus out of the document first.
      onMouseDown={(event) => event.preventDefault()}
      onClick={onClick}
      className={cx(
        'flex h-(--control-height) min-w-(--control-height) items-center justify-center rounded-card px-2',
        'text-13 text-muted transition-colors duration-100 hover:bg-sunken hover:text-ink',
        'disabled:pointer-events-none disabled:opacity-40',
        mono && 'font-mono'
      )}
    >
      {label}
    </button>
  );
}

function Toolbar({ editor }: { editor: Editor | null }) {
  if (!editor) return null;

  return (
    <div className="flex flex-wrap items-center gap-1">
      <ToolButton
        label="B"
        title="Bold"
        onClick={() => editor.chain().focus().toggleBold().run()}
      />
      <ToolButton
        label="I"
        title="Italic"
        onClick={() => editor.chain().focus().toggleItalic().run()}
      />
      <ToolButton
        label="‹›"
        title="Code"
        mono
        onClick={() => editor.chain().focus().toggleCode().run()}
      />
      <ToolButton
        label="H2"
        title="Heading"
        onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
      />
      <ToolButton
        label="H3"
        title="Subheading"
        onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()}
      />
      <ToolButton
        label="•"
        title="Bullet list"
        onClick={() => editor.chain().focus().toggleBulletList().run()}
      />
      <ToolButton
        label="1."
        title="Numbered list"
        onClick={() => editor.chain().focus().toggleOrderedList().run()}
      />
      <ToolButton
        label="—"
        title="Divider"
        onClick={() => editor.chain().focus().setHorizontalRule().run()}
      />
    </div>
  );
}
