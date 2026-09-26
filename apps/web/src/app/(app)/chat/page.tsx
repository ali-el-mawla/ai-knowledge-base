import type { Metadata } from 'next';
import { NewConversationView } from '@/features/chat/components/new-conversation-view';

export const metadata: Metadata = { title: 'Chat' };

export default function ChatPage() {
  return <NewConversationView />;
}
