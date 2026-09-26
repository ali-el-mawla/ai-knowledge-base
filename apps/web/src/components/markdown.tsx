import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { cn } from '@/lib/utils';

/** Links in user content open in a new tab so the editor or chat is not lost. */
function ExternalLink(props: React.ComponentProps<'a'>) {
  return <a {...props} target="_blank" rel="noopener noreferrer" />;
}

/**
 * Renders GitHub-flavoured markdown (tables, task lists, strikethrough). Raw HTML in the
 * source is not rendered, so user content cannot inject markup.
 */
export function Markdown({ children, className }: { children: string; className?: string }) {
  return (
    <div className={cn('markdown', className)}>
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={{ a: ExternalLink }}>
        {children}
      </ReactMarkdown>
    </div>
  );
}
