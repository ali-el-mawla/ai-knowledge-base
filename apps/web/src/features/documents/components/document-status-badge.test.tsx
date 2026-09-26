import type { DocumentIngestion } from '@repo/shared';
import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { TooltipProvider } from '@/components/ui/tooltip';
import { DocumentStatusBadge } from './document-status-badge';

function renderBadge(ingestion: Pick<DocumentIngestion, 'status' | 'error' | 'chunkCount'>) {
  const { container } = render(
    <TooltipProvider>
      <DocumentStatusBadge ingestion={ingestion} />
    </TooltipProvider>,
  );
  // The tooltip wrapper renders no element of its own, so the badge is the first child.
  const badge = container.firstElementChild;
  if (!badge) throw new Error('badge not rendered');
  return badge;
}

describe('DocumentStatusBadge', () => {
  it.each([
    ['pending', 'Queued'],
    ['processing', 'Indexing'],
  ] as const)('shows %s with a spinner', (status, label) => {
    const badge = renderBadge({ status, error: null, chunkCount: 0 });
    expect(badge.textContent).toBe(label);
    expect(badge.querySelector('svg')?.getAttribute('class')).toContain('animate-spin');
  });

  it('shows the chunk count when ready', () => {
    expect(renderBadge({ status: 'ready', error: null, chunkCount: 12 }).textContent).toBe(
      'Ready, 12 chunks',
    );
  });

  it('uses the singular for one chunk', () => {
    expect(renderBadge({ status: 'ready', error: null, chunkCount: 1 }).textContent).toContain(
      '1 chunk',
    );
    expect(renderBadge({ status: 'ready', error: null, chunkCount: 1 }).textContent).not.toContain(
      'chunks',
    );
  });

  it('shows the failure reason to assistive tech and keeps the badge focusable', () => {
    const badge = renderBadge({
      status: 'failed',
      error: 'Embedding provider unreachable',
      chunkCount: 0,
    });
    expect(badge.textContent).toBe('Failed: Embedding provider unreachable');
    expect(badge.getAttribute('tabindex')).toBe('0');
  });

  it('explains a failure without a stored error', () => {
    const badge = renderBadge({ status: 'failed', error: null, chunkCount: 0 });
    expect(badge.textContent).toContain('unknown reason');
  });
});
