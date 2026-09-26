import { splitCitationMarkers } from './citations';

/** The few mdast fields this plugin touches (the full types live in a transitive package). */
interface MdastNode {
  type: string;
  value?: string;
  children?: MdastNode[];
  data?: unknown;
}

/** Text inside these is not prose that can carry a citation. */
const SKIPPED_PARENTS = new Set(['link', 'linkReference']);

/** The attribute that carries the raw marker ("[1, 2]") to the `sup` renderer. */
export const CITATION_ATTRIBUTE = 'data-citation';

function citationNode(marker: string): MdastNode {
  return {
    type: 'citation',
    data: {
      hName: 'sup',
      hProperties: { dataCitation: marker },
      hChildren: [{ type: 'text', value: marker }],
    },
  };
}

function splitTextNode(node: MdastNode): MdastNode[] {
  const parts = splitCitationMarkers(node.value ?? '');
  if (parts.length === 1 && parts[0]?.type === 'text') return [node];
  return parts.map((part) =>
    part.type === 'text' ? { type: 'text', value: part.value } : citationNode(part.value),
  );
}

function transform(parent: MdastNode): void {
  if (!parent.children || SKIPPED_PARENTS.has(parent.type)) return;
  parent.children = parent.children.flatMap((child) => {
    if (child.type === 'text') return splitTextNode(child);
    transform(child);
    return [child];
  });
}

/**
 * Remark plugin: every citation marker in prose becomes a `<sup data-citation="[n]">`
 * element, which the answer renderer turns into clickable source chips. Code (inline and
 * fenced) is a different node type, so "items[1]" in a snippet is never touched.
 */
export function remarkCitations() {
  return (tree: { type: string }) => {
    transform(tree as MdastNode);
  };
}
