import type { Source } from '@repo/shared';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { TooltipProvider } from '@/components/ui/tooltip';
import { makeSource } from '../test-fixtures';
import { AnswerMarkdown } from './answer-markdown';

const SOURCES = [makeSource(1), makeSource(2), makeSource(3)];

function renderAnswer(
  content: string,
  options: { sources?: Source[]; activeIndex?: number | null; onOpen?: () => void } = {},
) {
  const onOpenSource = vi.fn(options.onOpen);
  const view = render(
    <TooltipProvider>
      <AnswerMarkdown
        content={content}
        sources={options.sources ?? SOURCES}
        activeIndex={options.activeIndex ?? null}
        onOpenSource={onOpenSource}
      />
    </TooltipProvider>,
  );
  const chips = () => screen.queryAllByRole('button').map((chip) => chip.textContent);
  return { ...view, onOpenSource, chips };
}

describe('AnswerMarkdown citations', () => {
  it('turns a valid marker into a chip named after its source', () => {
    renderAnswer('Employees get 25 days [1].');
    const chip = screen.getByRole('button', { name: 'Source 1: Document 1, Section 1' });
    expect(chip.textContent).toBe('1');
    expect(screen.getByText(/Employees get 25 days/).textContent).toBe('Employees get 25 days 1.');
  });

  it('does not repeat the title when the heading trail starts with it', () => {
    const handbook = makeSource(1, {
      documentTitle: 'Employee Handbook',
      headingPath: 'Employee handbook > Leave > Parental leave',
    });
    renderAnswer('Sixteen weeks [1].', { sources: [handbook] });
    expect(
      screen.getByRole('button', { name: 'Source 1: Employee Handbook, Leave > Parental leave' }),
    ).toBeTruthy();
  });

  it('opens the source with the chip as the trigger, by click or keyboard activation', () => {
    const { onOpenSource } = renderAnswer('Claim [2].');
    const chip = screen.getByRole('button', { name: /Source 2/ });
    fireEvent.click(chip);
    expect(onOpenSource).toHaveBeenCalledWith(SOURCES[1], chip);
    // A native button: Enter and Space activate it, so it is reachable without a mouse.
    expect(chip.tagName).toBe('BUTTON');
    expect(chip.getAttribute('type')).toBe('button');
  });

  it('renders adjacent markers as separate chips', () => {
    const { chips } = renderAnswer('Both agree [1][2].');
    expect(chips()).toEqual(['1', '2']);
  });

  it('expands a comma list', () => {
    expect(renderAnswer('See [1, 3].').chips()).toEqual(['1', '3']);
  });

  it.each([
    ['a hyphen range', 'See [1-3].'],
    ['an en dash range', 'See [1–3].'],
  ])('expands %s', (_, content) => {
    expect(renderAnswer(content).chips()).toEqual(['1', '2', '3']);
  });

  it('keeps a marker with no known source as plain text', () => {
    const { chips, container } = renderAnswer('Made up [7].');
    expect(chips()).toEqual([]);
    expect(container.textContent).toBe('Made up [7].');
    expect(container.querySelector('sup')).toBeNull();
  });

  it('only chips the numbers that are citable, keeping the rest as text', () => {
    // As for a saved answer whose validated citations are [1] only.
    const { chips, container } = renderAnswer('Claims [1] and [2].', { sources: [SOURCES[0]!] });
    expect(chips()).toEqual(['1']);
    expect(container.textContent).toContain('and [2].');
  });

  it('drops unknown numbers inside a marker that has a known one', () => {
    expect(renderAnswer('Mixed [2, 9].').chips()).toEqual(['2']);
  });

  it('leaves code, links and footnote-like text alone', () => {
    const { chips, container } = renderAnswer(
      'Use `items[1]` or see [1](https://example.com) and [^1].\n\n```ts\nconst a = b[2];\n```',
    );
    expect(chips()).toEqual([]);
    expect(container.querySelector('code')?.textContent).toBe('items[1]');
    expect(container.querySelector('a')?.getAttribute('href')).toBe('https://example.com');
    expect(container.querySelector('pre')?.textContent).toContain('b[2]');
  });

  it('finds markers inside emphasis, lists and tables', () => {
    const { chips } = renderAnswer(
      '**Bold claim [1]**\n\n- item [2]\n\n| a | b |\n| - | - |\n| cell [3] | x |',
    );
    expect(chips()).toEqual(['1', '2', '3']);
  });

  it('marks the chip whose source is open', () => {
    renderAnswer('A [1]. B [2].', { activeIndex: 2 });
    expect(screen.getByRole('button', { name: /Source 2/ }).getAttribute('aria-pressed')).toBe(
      'true',
    );
    expect(screen.getByRole('button', { name: /Source 1/ }).getAttribute('aria-pressed')).toBe(
      'false',
    );
  });
});
