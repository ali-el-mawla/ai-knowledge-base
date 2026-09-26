'use client';

import { PanelLeftIcon } from 'lucide-react';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet';
import { ConversationSidebar } from './conversation-sidebar';
import { ProviderIndicator } from './provider-indicator';

/** Below lg the conversation list is not docked; this button opens it as a sheet. */
function ConversationsSheet() {
  const [open, setOpen] = useState(false);
  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button variant="ghost" size="icon" className="lg:hidden" aria-label="Show conversations">
          <PanelLeftIcon />
        </Button>
      </SheetTrigger>
      <SheetContent side="left" className="w-80 gap-0 p-0">
        <SheetHeader className="border-b">
          <SheetTitle>Conversations</SheetTitle>
          <SheetDescription className="sr-only">
            Your conversations, most recent first.
          </SheetDescription>
        </SheetHeader>
        <ConversationSidebar onNavigate={() => setOpen(false)} />
      </SheetContent>
    </Sheet>
  );
}

/** Title row of the chat pane: conversation title and the models in use. */
export function ChatHeader({ title }: { title: string }) {
  return (
    <header className="flex h-14 shrink-0 items-center gap-2 border-b px-3 sm:px-4">
      <ConversationsSheet />
      <div className="grid min-w-0 flex-1 gap-0.5">
        <h1 className="truncate text-sm font-semibold">{title}</h1>
        <ProviderIndicator />
      </div>
    </header>
  );
}
