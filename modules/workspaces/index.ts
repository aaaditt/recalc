// Public API of the workspaces module. Import only from here.
export { ensureWorkspace, getWorkspace, setTerm } from './service';
export {
  workspaceSchema,
  termInputSchema,
  type Workspace,
  type TermInput,
} from './schema';
