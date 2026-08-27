import { QuestionCard } from '@/components/questions/question-card';
import { Card } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/empty-state';
import { localDateKey } from '@/lib/time';
import { formatShortDate } from '@/lib/today';
import type { QuestionCitation, QuestionView } from '@/modules/questions';

// The questions asked in one note, in the order they were asked.
//
// A server component: it fetches nothing and holds no state, it just turns what
// modules/questions read into what QuestionCard draws — including the dates,
// because a client component gets no timezone (docs/DECISIONS.md, slice 11).

type QuestionListProps = {
  questions: QuestionView[];
  timeZone: string;
  answerIt: (questionBlockId: string) => Promise<{ ok: boolean; error?: string }>;
  setResolved: (questionBlockId: string, resolved: boolean) => Promise<void>;
};

/**
 * "your notes from Tue 14 Oct" — prompts/12-questions.md's own example, and a
 * hard constraint: an answer has to say which of my blocks it drew from.
 */
export function citationLabel(citation: QuestionCitation): string {
  if (citation.date) return `your notes from ${formatShortDate(citation.date)}`;
  if (citation.noteTitle && citation.noteTitle.trim() !== '') {
    return `your note “${citation.noteTitle}”`;
  }
  return 'a note of yours';
}

export function QuestionList({
  questions,
  timeZone,
  answerIt,
  setResolved,
}: QuestionListProps) {
  if (questions.length === 0) {
    return (
      <Card>
        <EmptyState
          title="No questions yet"
          description="Select a sentence above and press Ask. The question stays anchored to that paragraph, and its answer is flagged the moment the paragraph changes."
        />
      </Card>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {questions.map((question) => (
        <QuestionCard
          key={question.blockId}
          blockId={question.blockId}
          text={question.text}
          status={question.status}
          askedLabel={`asked ${formatShortDate(localDateKey(new Date(question.createdAt), timeZone))}`}
          answer={
            question.answer
              ? {
                  text: question.answer.text,
                  status: question.answer.status,
                  error: question.answer.error,
                  model: question.answer.model,
                  computedLabel: question.answer.computedAt
                    ? formatShortDate(
                        localDateKey(new Date(question.answer.computedAt), timeZone)
                      )
                    : null,
                  citations: question.answer.citations.map((citation) => ({
                    blockId: citation.blockId,
                    label: citationLabel(citation),
                    href: citation.href,
                    excerpt: citation.text,
                  })),
                }
              : null
          }
          answerIt={answerIt.bind(null, question.blockId)}
          setResolved={setResolved.bind(null, question.blockId)}
        />
      ))}
    </div>
  );
}
