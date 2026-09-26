import ReactMarkdown, { type Components, type Options } from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { cn } from '@/lib/utils';

/** Links in user content open in a new tab so the editor or chat is not lost. */
function ExternalLink(props: React.ComponentProps<'a'>) {
  return <a {...props} target="_blank" rel="noopener noreferrer" />;
}

type RemarkPlugins = NonNullable<Options['remarkPlugins']>;

const BASE_PLUGINS: RemarkPlugins = [remarkGfm];
const BASE_COMPONENTS: Components = { a: ExternalLink };

interface MarkdownProps {
  children: string;
  className?: string;
  /** Extra remark plugins, run after GFM. Pass a stable (module-level) array. */
  remarkPlugins?: RemarkPlugins;
  /** Element overrides, merged over the defaults. Pass a stable (module-level) object. */
  components?: Components;
}

/**
 * Renders GitHub-flavoured markdown (tables, task lists, strikethrough). Raw HTML in the
 * source is not rendered, so user content cannot inject markup.
 */
export function Markdown({ children, className, remarkPlugins, components }: MarkdownProps) {
  return (
    <div className={cn('markdown', className)}>
      <ReactMarkdown
        remarkPlugins={remarkPlugins ? [...BASE_PLUGINS, ...remarkPlugins] : BASE_PLUGINS}
        components={components ? { ...BASE_COMPONENTS, ...components } : BASE_COMPONENTS}
      >
        {children}
      </ReactMarkdown>
    </div>
  );
}
