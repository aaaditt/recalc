import { z } from 'zod';

export const workspaceSchema = z.object({
  id: z.uuid(),
  owner_id: z.uuid(),
  name: z.string(),
  created_at: z.string(),
});

export type Workspace = z.infer<typeof workspaceSchema>;
