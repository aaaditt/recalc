import { FileTile } from '@/components/files/file-tile';
import { EmptyState } from '@/components/ui/empty-state';

// The thumbnail grid on a lecture page. Presentational: it is handed rows and a
// remove action and knows nothing about Drive, Supabase or the database.

export type FileGridItem = {
  id: string;
  name: string;
  mime_type: string | null;
  size_bytes: number | null;
  provider: string;
  viewUrl: string | null;
  thumbnailUrl: string | null;
  driveUrl: string | null;
};

export function FileGrid({
  files,
  remove,
}: {
  files: FileGridItem[];
  remove: (id: string) => Promise<void>;
}) {
  if (files.length === 0) {
    return (
      <EmptyState
        title="No files yet"
        description="Slides, a photo of the whiteboard, the problem sheet. Attach one below and it shows up here."
      />
    );
  }

  return (
    <ul
      aria-label="Files attached to this lecture"
      className="grid grid-cols-2 gap-3 sm:grid-cols-3"
    >
      {files.map((file) => (
        <FileTile
          key={file.id}
          id={file.id}
          name={file.name}
          mimeType={file.mime_type}
          sizeBytes={file.size_bytes}
          viewUrl={file.viewUrl}
          thumbnailUrl={file.thumbnailUrl}
          driveUrl={file.driveUrl}
          inDrive={file.provider === 'drive'}
          remove={remove}
        />
      ))}
    </ul>
  );
}
