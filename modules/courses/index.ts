// Public API of the courses module. Import only from here.
export {
  getCourses,
  getSyllabusUnits,
  getMeetingsOnDate,
  getMeetingsBetween,
  generateMeetings,
} from './service';
export {
  courseSchema,
  sessionSchema,
  syllabusUnitSchema,
  classMeetingSchema,
  meetingStatusSchema,
  syllabusUnitStatusSchema,
  weekdaySchema,
  type Course,
  type Session,
  type SyllabusUnit,
  type SyllabusUnitStatus,
  type ClassMeeting,
  type MeetingStatus,
  type GenerateMeetingsInput,
  type GenerateMeetingsResult,
} from './schema';
