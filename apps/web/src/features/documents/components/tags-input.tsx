'use client';

import { DOCUMENT_TAGS_MAX, TAG_MAX } from '@repo/shared';
import { XIcon } from 'lucide-react';
import { useId, useRef, useState } from 'react';
import { cn } from '@/lib/utils';

export interface TagsInputProps {
  /** Id of the text input, for a `<Label htmlFor>`. */
  id?: string;
  value: string[];
  onChange: (tags: string[]) => void;
  maxTags?: number;
  maxTagLength?: number;
  disabled?: boolean;
  invalid?: boolean;
  placeholder?: string;
  'aria-describedby'?: string;
}

/** Tags are case-insensitive in the API, so they are stored lowercase. */
export function normalizeTag(raw: string): string {
  return raw.trim().toLowerCase();
}

/**
 * A tag field: type a tag and press Enter or comma to add it (pasting "a, b, c" adds three),
 * Backspace in the empty field removes the last tag, and each tag has a remove button.
 * Tags are trimmed, lowercased and de-duplicated; a hint explains anything that was refused.
 */
export function TagsInput({
  id,
  value,
  onChange,
  maxTags = DOCUMENT_TAGS_MAX,
  maxTagLength = TAG_MAX,
  disabled,
  invalid,
  placeholder = 'Add a tag',
  'aria-describedby': describedBy,
}: TagsInputProps) {
  const [text, setText] = useState('');
  const [hint, setHint] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const hintId = useId();
  const atLimit = value.length >= maxTags;

  /** Adds each raw tag in order and reports the first reason one was refused. */
  function commit(rawTags: string[]) {
    const next = [...value];
    let refusal: string | null = null;
    for (const raw of rawTags) {
      const tag = normalizeTag(raw);
      if (!tag || next.includes(tag)) continue;
      if (tag.length > maxTagLength) {
        refusal ??= `Tags can be at most ${maxTagLength} characters.`;
        continue;
      }
      if (next.length >= maxTags) {
        refusal ??= `A document can have at most ${maxTags} tags.`;
        break;
      }
      next.push(tag);
    }
    setHint(refusal);
    if (next.length !== value.length) onChange(next);
  }

  function remove(tag: string) {
    setHint(null);
    onChange(value.filter((t) => t !== tag));
    inputRef.current?.focus();
  }

  function handleChange(event: React.ChangeEvent<HTMLInputElement>) {
    const parts = event.target.value.split(',');
    // Everything before the last comma is complete; the rest is still being typed.
    const pending = parts.pop() ?? '';
    if (parts.length > 0) commit(parts);
    setText(pending);
  }

  function handleKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (event.key === 'Enter' && text.trim()) {
      // Adding a tag must not submit the surrounding form.
      event.preventDefault();
      commit([text]);
      setText('');
    } else if (event.key === 'Backspace' && text === '' && value.length > 0) {
      event.preventDefault();
      remove(value[value.length - 1]!);
    }
  }

  function handleBlur() {
    // Typing a tag then clicking Save should keep the tag.
    if (text.trim()) {
      commit([text]);
      setText('');
    }
  }

  return (
    <div className="grid gap-1.5">
      <div
        className={cn(
          'flex min-h-9 w-full flex-wrap items-center gap-1.5 rounded-lg border border-input bg-transparent px-2 py-1.5 text-sm transition-colors focus-within:border-ring focus-within:ring-3 focus-within:ring-ring/50 dark:bg-input/30',
          invalid &&
            'border-destructive ring-3 ring-destructive/20 focus-within:border-destructive focus-within:ring-destructive/20',
          disabled && 'pointer-events-none opacity-50',
        )}
        onClick={(event) => {
          if (event.target === event.currentTarget) inputRef.current?.focus();
        }}
      >
        {value.length > 0 && (
          <ul className="contents" aria-label="Added tags">
            {value.map((tag) => (
              <li
                key={tag}
                className="inline-flex h-6 items-center gap-0.5 rounded-md bg-secondary pr-0.5 pl-2 text-xs font-medium text-secondary-foreground"
              >
                {tag}
                <button
                  type="button"
                  onClick={() => remove(tag)}
                  disabled={disabled}
                  aria-label={`Remove tag ${tag}`}
                  className="inline-flex size-5 items-center justify-center rounded-sm text-muted-foreground outline-none hover:bg-background/60 hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <XIcon className="size-3" aria-hidden />
                </button>
              </li>
            ))}
          </ul>
        )}
        <input
          ref={inputRef}
          id={id}
          type="text"
          value={text}
          onChange={handleChange}
          onKeyDown={handleKeyDown}
          onBlur={handleBlur}
          disabled={disabled}
          placeholder={atLimit ? 'Tag limit reached' : placeholder}
          autoComplete="off"
          autoCapitalize="none"
          spellCheck={false}
          aria-invalid={invalid || undefined}
          aria-describedby={
            [describedBy, hint ? hintId : undefined].filter(Boolean).join(' ') || undefined
          }
          className="h-6 min-w-24 flex-1 bg-transparent outline-none placeholder:text-muted-foreground"
        />
      </div>
      <p
        id={hintId}
        aria-live="polite"
        className={cn('text-sm text-muted-foreground', !hint && 'sr-only')}
      >
        {hint}
      </p>
    </div>
  );
}
