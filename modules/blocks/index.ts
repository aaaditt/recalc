// Public API of the blocks module. Import only from here.
export {
  createBlock,
  updateBlock,
  getBlock,
  normalise,
  hashContent,
  plainTextOf,
  positionBetween,
} from './service';
export {
  blockSchema,
  blockTypeSchema,
  blockContentSchema,
  type Block,
  type BlockType,
  type BlockContent,
  type CreateBlockInput,
  type UpdateBlockInput,
} from './schema';
