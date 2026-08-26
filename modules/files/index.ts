// Public API of the files module. Import only from here.
//
// Owns the `files` table and the `note-images` Storage bucket. It stores
// references — a Drive file id, or an object path — and never bytes in
// Postgres (docs/SCHEMA.md).
export {
  attachDriveFiles,
  saveNoteImage,
  removeFile,
  getFile,
  getFilesForMeeting,
  getFilesForCourse,
  getFilesForBlock,
  courseCodeForMeeting,
} from './service';
export {
  fileSchema,
  fileProviderSchema,
  attachDriveFilesInputSchema,
  saveImageInputSchema,
  type FileRow,
  type FileView,
  type FileProvider,
  type AttachmentLinks,
  type AttachDriveFilesInput,
  type SaveImageInput,
} from './schema';
