import { Extension } from '@tiptap/react';
import { Fragment, Slice, type Node as ProseMirrorNode } from '@tiptap/pm/model';
import { Plugin, PluginKey } from '@tiptap/pm/state';

// The link between a paragraph on screen and a row in `blocks`.
//
// Every top-level node in a note carries a `blockId`, and the editor is the
// thing that mints it: a node that has one is an existing block, a node
// without one is new. That makes saving a one-way write — the server never has
// to hand ids back, so nothing has to be patched into the document underneath
// a cursor that is still typing.
//
// Three rules keep the ids honest:
//
//   1. A node that is split (Enter in the middle of a paragraph) does not
//      carry its id into the new half — `keepOnSplit: false`.
//   2. Anything pasted arrives with its ids stripped, so content copied out of
//      another note never claims that note's blocks.
//   3. After every change, any top-level node with no id, or with an id
//      already used above it, gets a fresh one.

/**
 * The top-level nodes a note document can contain. Each of these becomes one
 * `blocks` row; inline nodes and list items live inside their parent's JSON.
 */
export const NOTE_BLOCK_TYPES = [
  'paragraph',
  'heading',
  'bulletList',
  'orderedList',
  'codeBlock',
  'horizontalRule',
];

/** Drop every blockId in a pasted slice, so rule 2 above holds. */
function withoutIds(fragment: Fragment): Fragment {
  const nodes: ProseMirrorNode[] = [];

  fragment.forEach((node) => {
    const content = withoutIds(node.content);
    nodes.push(
      'blockId' in node.attrs
        ? node.type.create({ ...node.attrs, blockId: null }, content, node.marks)
        : node.copy(content)
    );
  });

  return Fragment.fromArray(nodes);
}

export const BlockId = Extension.create({
  name: 'blockId',

  addGlobalAttributes() {
    return [
      {
        types: NOTE_BLOCK_TYPES,
        attributes: {
          blockId: {
            default: null,
            keepOnSplit: false,
            parseHTML: (element) => element.getAttribute('data-block-id'),
            renderHTML: (attributes) =>
              attributes.blockId ? { 'data-block-id': attributes.blockId } : {},
          },
        },
      },
    ];
  },

  addProseMirrorPlugins() {
    return [
      new Plugin({
        key: new PluginKey('blockId'),

        appendTransaction: (transactions, _oldState, newState) => {
          if (!transactions.some((transaction) => transaction.docChanged)) return null;

          const tr = newState.tr;
          const seen = new Set<string>();
          let changed = false;

          newState.doc.forEach((node, position) => {
            if (!('blockId' in node.attrs)) return;

            const id: unknown = node.attrs.blockId;
            if (typeof id === 'string' && id !== '' && !seen.has(id)) {
              seen.add(id);
              return;
            }

            const fresh = crypto.randomUUID();
            seen.add(fresh);
            tr.setNodeMarkup(position, undefined, { ...node.attrs, blockId: fresh });
            changed = true;
          });

          return changed ? tr : null;
        },

        props: {
          transformPasted: (slice) =>
            new Slice(withoutIds(slice.content), slice.openStart, slice.openEnd),
        },
      }),
    ];
  },
});
