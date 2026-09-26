import { MESSAGE_CONTENT_MAX } from '@repo/shared';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { Composer } from './composer';

function renderComposer(props: Partial<React.ComponentProps<typeof Composer>> = {}) {
  const onSend = vi.fn();
  const onStop = vi.fn();
  render(<Composer onSend={onSend} onStop={onStop} {...props} />);
  const field = screen.getByLabelText<HTMLTextAreaElement>('Message');
  const type = (value: string) => fireEvent.change(field, { target: { value } });
  return { onSend, onStop, field, type };
}

describe('Composer', () => {
  it('sends the trimmed text on Enter and clears the field', () => {
    const { onSend, field, type } = renderComposer();
    type('  How much leave do I get?  ');
    fireEvent.keyDown(field, { key: 'Enter' });
    expect(onSend).toHaveBeenCalledWith('How much leave do I get?');
    expect(field.value).toBe('');
  });

  it('keeps Shift+Enter for a new line', () => {
    const { onSend, field, type } = renderComposer();
    type('First line');
    const event = fireEvent.keyDown(field, { key: 'Enter', shiftKey: true });
    // Not prevented: the browser inserts the line break.
    expect(event).toBe(true);
    expect(onSend).not.toHaveBeenCalled();
  });

  it('does not send while an input method is composing', () => {
    const { onSend, field, type } = renderComposer();
    type('にほんご');
    fireEvent.keyDown(field, { key: 'Enter', isComposing: true });
    expect(onSend).not.toHaveBeenCalled();
  });

  it('does not send blank text', () => {
    const { onSend, field, type } = renderComposer();
    type('   \n  ');
    fireEvent.keyDown(field, { key: 'Enter' });
    expect(onSend).not.toHaveBeenCalled();
    expect(screen.getByRole<HTMLButtonElement>('button', { name: 'Send' }).disabled).toBe(true);
  });

  it('sends with the Send button', () => {
    const { onSend, type } = renderComposer();
    type('Question');
    fireEvent.click(screen.getByRole('button', { name: 'Send' }));
    expect(onSend).toHaveBeenCalledWith('Question');
  });

  it('while streaming: Stop replaces Send, Enter waits, Escape and Stop stop', () => {
    const { onSend, onStop, field, type } = renderComposer({ streaming: true });
    expect(screen.queryByRole('button', { name: 'Send' })).toBeNull();

    type('Next question');
    fireEvent.keyDown(field, { key: 'Enter' });
    expect(onSend).not.toHaveBeenCalled();
    expect(field.value).toBe('Next question');

    fireEvent.keyDown(field, { key: 'Escape' });
    fireEvent.click(screen.getByRole('button', { name: 'Stop' }));
    expect(onStop).toHaveBeenCalledTimes(2);
    expect(document.activeElement).toBe(field);
  });

  it('explains why sending is blocked and does not send', () => {
    const { onSend, field, type } = renderComposer({ blockedReason: 'No chat model.' });
    expect(screen.getByText('No chat model.')).toBeTruthy();
    expect(field.getAttribute('aria-describedby')).toContain(screen.getByText('No chat model.').id);
    type('Question');
    fireEvent.keyDown(field, { key: 'Enter' });
    expect(onSend).not.toHaveBeenCalled();
  });

  it('enforces the message limit and shows a counter near it', () => {
    const { field, type } = renderComposer();
    expect(field.maxLength).toBe(MESSAGE_CONTENT_MAX);
    expect(screen.queryByText(/\/ 4,000/)).toBeNull();
    type('x'.repeat(MESSAGE_CONTENT_MAX - 100));
    expect(screen.getByText('3,900 / 4,000')).toBeTruthy();
  });

  it('focuses the field on mount when asked', () => {
    const { field } = renderComposer({ autoFocus: true });
    expect(document.activeElement).toBe(field);
  });
});
