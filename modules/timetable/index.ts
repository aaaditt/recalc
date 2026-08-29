// Public API of the timetable module. Import only from here.
//
// Owns the `periods` table — the numbered rows of the printed timetable — and
// the orchestration behind clicking a cell on /timetable. Courses, weekly
// patterns and dated lectures stay in modules/courses.
//
// Slice 17 adds the two things that were still only possible in the Supabase
// table editor: editing the grid's own rows, and deleting a course. Both are
// here rather than in modules/courses because both need to ask modules/files,
// modules/tasks or modules/notes a question, and all three of those import
// modules/courses.
export {
  getPeriods,
  getPeriodUsage,
  getTimetable,
  addPeriod,
  updatePeriod,
  removePeriod,
  applyPeriodToClasses,
  addClass,
  updateClass,
  removeClass,
  removeCourse,
  type ClassChange,
} from './service';
export {
  periodSchema,
  periodLabelSchema,
  periodTimeSchema,
  addPeriodInputSchema,
  updatePeriodInputSchema,
  addClassInputSchema,
  updateClassInputSchema,
  DEFAULT_PERIODS,
  type Period,
  type PeriodUsage,
  type AddPeriodInput,
  type UpdatePeriodInput,
  type ApplyPeriodResult,
  type AddClassInput,
  type UpdateClassInput,
  type RemoveClassResult,
  type RemoveCourseResult,
} from './schema';
