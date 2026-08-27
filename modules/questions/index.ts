// Public API of the questions module. Import only from here.
//
// The answering is slice 11's engine — `generateAnswer` in modules/recalc,
// which goes through the same `runDerivation` a summary does. Nothing in here
// runs a derivation itself.
export {
  answerQuestion,
  askQuestion,
  getQuestionsForNote,
  getUnresolvedQuestions,
  listQuestions,
  reopenQuestion,
  resolveQuestion,
} from './service';
export {
  askQuestionInputSchema,
  isUnresolved,
  questionSchema,
  questionStatusSchema,
  questionTextSchema,
  type AskQuestionInput,
  type QuestionAnchorRow,
  type QuestionAnswerView,
  type QuestionCitation,
  type QuestionRow,
  type QuestionStatus,
  type QuestionView,
} from './schema';
