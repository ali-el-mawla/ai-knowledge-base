import type { Metadata } from 'next';
import { DocumentEditor } from '@/features/documents/components/document-editor';

export const metadata: Metadata = { title: 'Edit document' };

export default async function DocumentPage({ params }: PageProps<'/documents/[id]'>) {
  const { id } = await params;
  // key: moving between documents starts with a fresh editor instead of carrying state over.
  return <DocumentEditor key={id} documentId={id} />;
}
