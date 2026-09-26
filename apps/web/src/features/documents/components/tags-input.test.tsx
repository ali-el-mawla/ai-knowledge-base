import { fireEvent, render, screen } from '@testing-library/react';
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { TagsInput } from './tags-input';

function Harness({
  initial = [],
  maxTags,
  onSubmit,
}: {
  initial?: string[];
  maxTags?: number;
  onSubmit?: () => void;
}) {
  const [tags, setTags] = useState(initial);
  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        onSubmit?.();
      }}
    >
      <label htmlFor="tags">Tags</label>
      <TagsInput id="tags" value={tags} onChange={setTags} maxTags={maxTags} />
      <output data-testid="tags">{tags.join('|')}</output>
    </form>
  );
}

const input = () => screen.getByLabelText<HTMLInputElement>('Tags');
const tags = () => screen.getByTestId('tags').textContent;

function type(value: string) {
  fireEvent.change(input(), { target: { value } });
}

describe('TagsInput', () => {
  it('adds a trimmed, lowercased tag on Enter without submitting the form', () => {
    const onSubmit = vi.fn();
    render(<Harness onSubmit={onSubmit} />);
    type('  Policy ');
    fireEvent.keyDown(input(), { key: 'Enter' });
    expect(tags()).toBe('policy');
    expect(input().value).toBe('');
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('adds tags on comma, including several pasted at once', () => {
    render(<Harness />);
    type('HR, onboarding,');
    expect(tags()).toBe('hr|onboarding');
    type('lea');
    expect(input().value).toBe('lea');
  });

  it('ignores duplicates', () => {
    render(<Harness initial={['policy']} />);
    type('POLICY,');
    expect(tags()).toBe('policy');
  });

  it('removes the last tag with Backspace in the empty field', () => {
    render(<Harness initial={['a', 'b']} />);
    fireEvent.keyDown(input(), { key: 'Backspace' });
    expect(tags()).toBe('a');
  });

  it('removes a specific tag with its remove button', () => {
    render(<Harness initial={['a', 'b', 'c']} />);
    fireEvent.click(screen.getByRole('button', { name: 'Remove tag b' }));
    expect(tags()).toBe('a|c');
  });

  it('commits the pending text on blur', () => {
    render(<Harness />);
    type('draft');
    fireEvent.blur(input());
    expect(tags()).toBe('draft');
  });

  it('refuses tags past the limit and says why', () => {
    render(<Harness initial={['a', 'b']} maxTags={2} />);
    type('c,');
    expect(tags()).toBe('a|b');
    expect(screen.getByText('A document can have at most 2 tags.')).toBeTruthy();
  });
});
