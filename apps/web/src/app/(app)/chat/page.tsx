import type { Metadata } from 'next';
import Link from 'next/link';
import { MessagesSquareIcon } from 'lucide-react';
import { EmptyState } from '@/components/empty-state';
import { Button } from '@/components/ui/button';

export const metadata: Metadata = { title: 'Chat' };

export default function ChatPage() {
  return (
    <div className="flex h-full items-center justify-center p-6">
      <EmptyState
        icon={MessagesSquareIcon}
        title="Chat is coming soon"
        description="You will be able to ask questions about your documents and get answers that cite the exact passages they came from."
        action={
          <Button asChild variant="outline">
            <Link href="/documents">Go to documents</Link>
          </Button>
        }
      />
    </div>
  );
}
