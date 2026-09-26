import { describe, expect, it } from 'vitest';
import { mergeMessages } from './queries';
import { makeMessage } from './test-fixtures';

describe('mergeMessages', () => {
  const first = makeMessage({ id: 'a' });
  const second = makeMessage({ id: 'b', role: 'assistant' });

  it('appends messages that are not there yet, in order', () => {
    expect(mergeMessages([first], [second]).map((message) => message.id)).toEqual(['a', 'b']);
  });

  it('skips messages already in the history (a refetch got there first)', () => {
    const current = [first, second];
    expect(mergeMessages(current, [second])).toBe(current);
  });
});
