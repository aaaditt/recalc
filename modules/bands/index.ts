// Public API of the bands module. Import only from here.
//
// A band is a named, recurring stretch of the day that runs by its own rules —
// University 07:30–15:40, Evening 16:00–23:00 — and inside it, its own weekly
// slots. Slice 25.
//
// The one thing to know before using this module: **a band frames time, it
// never owns it.** The university band holds no class data at all. It is drawn
// from `sessions` and `class_meetings`, which modules/courses owns and
// /timetable already reads, so there is exactly one place a class lives.
// Deleting the university band deletes a frame and not one lecture.
//
// `bands` are not `blocks`. `blocks` is the versioned primitive this whole app
// is made of (docs/SCHEMA.md); a band carries no content, no version and no
// content_hash, and nothing is ever derived from one.
export {
  getBands,
  getBand,
  ensureUniversityBand,
  createBand,
  updateBand,
  removeBand,
  addSlot,
  updateSlot,
  removeSlot,
} from './service';
export {
  bandSchema,
  bandSlotSchema,
  bandNameSchema,
  bandTimeSchema,
  bandKindSchema,
  slotLabelSchema,
  weekdaysSchema,
  createBandInputSchema,
  updateBandInputSchema,
  addSlotInputSchema,
  updateSlotInputSchema,
  BandRuleError,
  type Band,
  type BandSlot,
  type BandWithSlots,
  type CreateBandInput,
  type UpdateBandInput,
  type AddSlotInput,
  type UpdateSlotInput,
} from './schema';
