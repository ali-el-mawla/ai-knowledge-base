import { ChatLayout } from '@/features/chat/components/chat-layout';

export default function Layout({ children }: LayoutProps<'/chat'>) {
  return <ChatLayout>{children}</ChatLayout>;
}
