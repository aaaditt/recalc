// Public API of the proposals module. Import only from here.
//
// Owns `email_proposals`: what an email might mean, waiting for a human to say
// yes or no. The email itself belongs to modules/gmail, the model call belongs
// to modules/recalc's `extract` recipe, and the task that acceptance creates
// belongs to modules/tasks. This module is the one place that joins them, and
// the only place in the app where an email can become a task at all.
export {
  MAILBOX_WINDOW,
  MAX_CALLS_PER_SCAN,
  acceptProposal,
  extractFromEmail,
  getInbox,
  getProposalsForEmail,
  rejectProposal,
  scanMailbox,
  type Decision,
  type EmailScanResult,
  type Inbox,
  type InboxItem,
  type ProposalsContext,
  type ScanOptions,
  type ScanSummary,
} from './service';
export {
  PLAUSIBLE_AT,
  gateEmail,
  matchCourse,
  type CourseHint,
  type GateInput,
  type GateVerdict,
} from './gate';
export {
  emailProposalSchema,
  fingerprintOf,
  payloadOf,
  proposalKindSchema,
  proposalStatusSchema,
  taskTitleOf,
  type EmailProposal,
  type ProposalKind,
  type ProposalPayload,
  type ProposalStatus,
} from './schema';
