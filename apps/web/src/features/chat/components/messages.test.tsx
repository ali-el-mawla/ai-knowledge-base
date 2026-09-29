import type { TokenUsage } from '@repo/shared';
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { TooltipProvider } from '@/components/ui/tooltip';
import { makeSource } from '../test-fixtures';
import { AssistantMessage, type AnswerStatus } from './messages';

const USAGE: TokenUsage = { promptTokens: 1234, completionTokens: 56 };
const MODEL = 'anthropic/claude-sonnet-5';
const USAGE_LINE = 'anthropic/claude-sonnet-5 · 1,234 in / 56 out tokens';

function renderAnswer(
  options: { status?: AnswerStatus; usage?: TokenUsage | null; model?: string | null } = {},
) {
  return render(
    <TooltipProvider>
      <AssistantMessage
        messageId="message-2"
        content="Full-time staff get 25 days [1]."
        status={options.status ?? 'complete'}
        sources={[makeSource(1)]}
        citations={[1]}
        rewrittenQuery={null}
        activeIndex={null}
        onOpenSource={vi.fn()}
        usage={options.usage === undefined ? USAGE : options.usage}
        model={options.model === undefined ? MODEL : options.model}
      />
    </TooltipProvider>,
  );
}

describe('AssistantMessage usage line', () => {
  it('shows the model and the token counts under a complete answer', () => {
    renderAnswer();
    expect(screen.getByText(USAGE_LINE)).toBeTruthy();
  });

  it.each<[string, Parameters<typeof renderAnswer>[0]]>([
    ['the usage is unknown', { usage: null }],
    ['the model is unknown', { model: null }],
    ['the answer was stopped', { status: 'aborted' }],
    ['the answer is still being written', { status: 'writing' }],
  ])('is hidden when %s', (_case, options) => {
    renderAnswer(options);
    expect(screen.queryByText(/out tokens/)).toBeNull();
  });
});
