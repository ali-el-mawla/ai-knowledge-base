'use client';

import { MESSAGE_CONTENT_MAX } from '@repo/shared';
import { ArrowUpIcon, Loader2Icon, SquareIcon } from 'lucide-react';
import {
  type Ref,
  useEffect,
  useId,
  useImperativeHandle,
  useLayoutEffect,
  useRef,
  useState,
} from 'react';
import { Button } from '@/components/ui/button';
import { formatNumber } from '@/lib/format';
import { cn } from '@/lib/utils';

/** Tallest the field grows before it scrolls, in pixels (about ten lines). */
const MAX_HEIGHT_PX = 240;
/** The character counter appears past this share of the limit. */
const COUNTER_FROM = 0.8;

export interface ComposerHandle {
  /** Moves focus to the field, except on touch screens (it would open the keyboard). */
  focus(): void;
}

interface ComposerProps {
  onSend: (text: string) => void;
  onStop?: () => void;
  /** This conversation's answer is being written: Stop replaces Send. */
  streaming?: boolean;
  /** A send is being prepared (creating the conversation): Send shows a spinner. */
  pending?: boolean;
  /** Why sending is not possible right now; shown above the field. */
  blockedReason?: React.ReactNode;
  placeholder?: string;
  /** Focus the field on mount (skipped on touch screens, where it would open the keyboard). */
  autoFocus?: boolean;
  ref?: Ref<ComposerHandle>;
}

function isTouchOnly(): boolean {
  return window.matchMedia?.('(pointer: coarse)').matches ?? false;
}

/** Grows the field with its content, up to MAX_HEIGHT_PX (field-sizing is not everywhere yet). */
function fitToContent(field: HTMLTextAreaElement | null) {
  if (!field) return;
  field.style.height = 'auto';
  field.style.height = `${Math.min(field.scrollHeight, MAX_HEIGHT_PX)}px`;
}

/**
 * The message box. Enter sends, Shift+Enter adds a line, Escape stops a streaming answer.
 * The field stays editable while an answer streams, so the next question can be drafted;
 * only sending waits.
 */
export function Composer({
  onSend,
  onStop,
  streaming = false,
  pending = false,
  blockedReason,
  placeholder = 'Ask a question about your documents',
  autoFocus = false,
  ref,
}: ComposerProps) {
  const [value, setValue] = useState('');
  const fieldRef = useRef<HTMLTextAreaElement>(null);
  const fieldId = useId();
  const hintId = useId();
  const reasonId = useId();

  useImperativeHandle(
    ref,
    () => ({
      focus: () => {
        if (!isTouchOnly()) fieldRef.current?.focus({ preventScroll: true });
      },
    }),
    [],
  );

  useLayoutEffect(() => fitToContent(fieldRef.current), [value]);

  useEffect(() => {
    if (autoFocus && !isTouchOnly()) fieldRef.current?.focus({ preventScroll: true });
  }, [autoFocus]);

  const text = value.trim();
  const canSend = text.length > 0 && !streaming && !pending && !blockedReason;
  const showCounter = value.length >= MESSAGE_CONTENT_MAX * COUNTER_FROM;

  function submit() {
    if (!canSend) return;
    onSend(text);
    setValue('');
  }

  function stop() {
    onStop?.();
    fieldRef.current?.focus();
  }

  function handleKeyDown(event: React.KeyboardEvent<HTMLTextAreaElement>) {
    // An IME uses Enter to confirm a composition; that Enter must not send.
    if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) {
      event.preventDefault();
      submit();
    } else if (event.key === 'Escape' && streaming) {
      event.preventDefault();
      stop();
    }
  }

  const describedBy = [blockedReason ? reasonId : null, hintId].filter(Boolean).join(' ');

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        submit();
      }}
      className="grid gap-2"
    >
      {blockedReason && (
        <p id={reasonId} className="text-xs text-muted-foreground">
          {blockedReason}
        </p>
      )}
      <div className="flex items-end gap-2 rounded-xl border border-input bg-background p-1.5 transition-colors focus-within:border-ring focus-within:ring-3 focus-within:ring-ring/50 dark:bg-input/30">
        <label htmlFor={fieldId} className="sr-only">
          Message
        </label>
        <textarea
          id={fieldId}
          ref={fieldRef}
          value={value}
          onChange={(event) => setValue(event.target.value)}
          onKeyDown={handleKeyDown}
          rows={1}
          maxLength={MESSAGE_CONTENT_MAX}
          placeholder={placeholder}
          aria-describedby={describedBy}
          className="max-h-60 min-h-9 flex-1 resize-none bg-transparent px-2 py-1.5 text-base outline-none placeholder:text-muted-foreground md:text-sm"
        />
        {streaming ? (
          <Button type="button" size="icon" variant="outline" onClick={stop} aria-label="Stop">
            <SquareIcon className="fill-current" />
          </Button>
        ) : (
          <Button type="submit" size="icon" disabled={!canSend} aria-label="Send">
            {pending ? <Loader2Icon className="motion-safe:animate-spin" /> : <ArrowUpIcon />}
          </Button>
        )}
      </div>
      <div className="flex items-center justify-between gap-3 px-1 text-xs text-muted-foreground">
        <p id={hintId}>
          {streaming
            ? 'Writing the answer. Press Escape or Stop to end it.'
            : 'Enter to send, Shift+Enter for a new line'}
        </p>
        {showCounter && (
          <p
            className={cn(
              'tabular-nums',
              value.length >= MESSAGE_CONTENT_MAX && 'font-medium text-destructive',
            )}
            aria-live="polite"
          >
            {formatNumber(value.length)} / {formatNumber(MESSAGE_CONTENT_MAX)}
          </p>
        )}
      </div>
    </form>
  );
}
