'use client';

import type { Conversation } from '@repo/shared';
import { Loader2Icon, MoreHorizontalIcon, PencilIcon, Trash2Icon } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCallback, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { formatDateTime, formatRelativeTime } from '@/lib/format';
import { cn } from '@/lib/utils';
import { useChatSession } from '../chat-session';
import { DeleteConversationDialog, RenameConversationDialog } from './conversation-dialogs';

/**
 * One conversation in the sidebar: a link to it, a spinner while it is answering, and an
 * actions menu (rename, delete). The menu button shows on hover or focus with a mouse, and
 * always on touch screens.
 */
export function ConversationItem({
  conversation,
  active,
  answering,
  onNavigate,
}: {
  conversation: Conversation;
  active: boolean;
  answering: boolean;
  onNavigate?: () => void;
}) {
  const router = useRouter();
  const stream = useChatSession();
  const [dialog, setDialog] = useState<'rename' | 'delete' | null>(null);
  const actionsRef = useRef<HTMLButtonElement>(null);

  // The dialogs open from a menu item that is gone by the time they close, so focus would
  // fall back to the page; it returns to this conversation's actions button instead.
  const returnFocus = useCallback((event: Event) => {
    event.preventDefault();
    actionsRef.current?.focus();
  }, []);

  return (
    <li
      className={cn(
        'group relative flex items-center gap-1 rounded-lg pr-1 transition-colors hover:bg-muted/70 has-[a:focus-visible]:bg-muted/70',
        active && 'bg-muted hover:bg-muted',
      )}
    >
      <Link
        href={`/chat/${conversation.id}`}
        onClick={onNavigate}
        aria-current={active ? 'page' : undefined}
        className="grid min-w-0 flex-1 gap-0.5 rounded-lg px-2.5 py-2 outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
      >
        <span
          className={cn('truncate text-sm', active && 'font-medium')}
          title={conversation.title}
        >
          {conversation.title}
        </span>
        <time
          dateTime={conversation.updatedAt}
          title={formatDateTime(conversation.updatedAt)}
          className="text-xs text-muted-foreground"
        >
          {formatRelativeTime(conversation.updatedAt)}
        </time>
      </Link>
      {answering && (
        <Loader2Icon
          className="size-3.5 shrink-0 text-muted-foreground motion-safe:animate-spin"
          role="img"
          aria-label="Answering"
        />
      )}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            ref={actionsRef}
            variant="ghost"
            size="icon-xs"
            aria-label={`Actions for ${conversation.title}`}
            className="shrink-0 text-muted-foreground group-hover:opacity-100 focus-visible:opacity-100 data-[state=open]:opacity-100 pointer-fine:opacity-0"
          >
            <MoreHorizontalIcon />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-40">
          <DropdownMenuItem onSelect={() => setDialog('rename')}>
            <PencilIcon aria-hidden />
            Rename
          </DropdownMenuItem>
          <DropdownMenuItem variant="destructive" onSelect={() => setDialog('delete')}>
            <Trash2Icon aria-hidden />
            Delete
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <RenameConversationDialog
        conversation={conversation}
        open={dialog === 'rename'}
        onOpenChange={(open) => setDialog(open ? 'rename' : null)}
        onCloseAutoFocus={returnFocus}
      />
      <DeleteConversationDialog
        conversation={conversation}
        open={dialog === 'delete'}
        onOpenChange={(open) => setDialog(open ? 'delete' : null)}
        onCloseAutoFocus={returnFocus}
        // An answer cannot be saved into a deleted conversation; stop it first.
        onBeforeDelete={answering ? stream.stop : undefined}
        onDeleted={active ? () => router.replace('/chat') : undefined}
      />
    </li>
  );
}
