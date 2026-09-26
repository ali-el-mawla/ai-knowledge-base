'use client';

import { FilePlus2Icon, MessagesSquareIcon } from 'lucide-react';
import Link from 'next/link';
import { useId } from 'react';
import { EmptyState } from '@/components/empty-state';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { useDocuments } from '@/features/documents/queries';

/** Questions the sample corpus (`npm run seed`) can answer. */
export const EXAMPLE_QUESTIONS = [
  'How many days of annual leave do employees get?',
  'How fast does Premium Support respond to a P1 ticket?',
  'What are the first steps when a security incident is reported?',
] as const;

/** Only the total matters here, so one row is enough. */
const DOCUMENT_COUNT_PARAMS = { limit: 1, offset: 0 };

/**
 * What chat does, before the first question: where answers come from, how citations work,
 * three example questions, and a pointer to "New document" when there is nothing to search.
 */
export function ChatIntro({
  onAsk,
  disabled = false,
}: {
  onAsk: (question: string) => void;
  disabled?: boolean;
}) {
  const documents = useDocuments(DOCUMENT_COUNT_PARAMS);
  const noDocuments = documents.data?.total === 0;
  const examplesId = useId();

  return (
    <div className="mx-auto grid w-full max-w-xl gap-6">
      <EmptyState
        icon={MessagesSquareIcon}
        title="Ask your documents"
        description="Answers come only from your documents. Each claim ends with a numbered citation: select it to read the exact passage and see how it was found."
        className="py-6"
      />
      {noDocuments && (
        <Alert>
          <FilePlus2Icon aria-hidden />
          <AlertTitle>You have no documents yet</AlertTitle>
          <AlertDescription>
            <p>Chat can only answer from documents you add. Add one, then come back.</p>
            <Button asChild size="sm" className="mt-2">
              <Link href="/documents/new">New document</Link>
            </Button>
          </AlertDescription>
        </Alert>
      )}
      <section aria-labelledby={examplesId} className="grid gap-2">
        <h2 id={examplesId} className="text-xs font-medium text-muted-foreground">
          Try asking
        </h2>
        <ul className="grid gap-2">
          {EXAMPLE_QUESTIONS.map((question) => (
            <li key={question}>
              <Button
                type="button"
                variant="outline"
                disabled={disabled}
                onClick={() => onAsk(question)}
                className="h-auto w-full justify-start px-3 py-2 text-left whitespace-normal"
              >
                {question}
              </Button>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
