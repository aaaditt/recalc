// Public API of the timetable module. Import only from here.
//
// Owns the `periods` table — the numbered rows of the printed timetable — and
// the orchestration behind clicking a cell on /timetable. Courses, weekly
// patterns and dated lectures stay in modules/courses.
export {
  getPeriods,
  getTimetable,
  addClass,
  updateClass,
  removeClass,
  type ClassChange,
} from './service';
export {
  periodSchema,
  addClassInputSchema,
  updateClassInputSchema,
  DEFAULT_PERIODS,
  type Period,
  type AddClassInput,
  type UpdateClassInput,
  type RemoveClassResult,
} from './schema';
