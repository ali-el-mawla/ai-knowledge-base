import type { Metadata } from 'next';
import { ConversationView } from '@/features/chat/components/conversation-view';

export const metadata: Metadata = { title: 'Chat' };

export default async function ConversationPage({ params }: PageProps<'/chat/[id]'>) {
  const { id } = await params;
  // key: switching conversations starts with a fresh view (scroll, open source, draft).
  return <ConversationView key={id} conversationId={id} />;
}
