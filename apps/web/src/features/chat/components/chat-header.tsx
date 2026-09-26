'use client';

import { PanelLeftCloseIcon, PanelLeftIcon, PanelLeftOpenIcon } from 'lucide-react';
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
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { useMediaQuery } from '@/hooks/use-media-query';
import { useDockedConversationList } from './chat-layout';
import { ConversationSidebar } from './conversation-sidebar';
import { ProviderIndicator } from './provider-indicator';

/** Tailwind's lg: from here the conversation list is docked next to the chat. */
const DOCKED_LIST_QUERY = '(min-width: 64rem)';

/** Below lg the conversation list is not docked; this button opens it as a sheet. */
function ConversationsSheet() {
  const [open, setOpen] = useState(false);
  // Growing the window past lg docks the list, so the sheet closes.
  const docked = useMediaQuery(DOCKED_LIST_QUERY);
  if (open && docked) setOpen(false);

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button variant="ghost" size="icon" className="lg:hidden" aria-label="Show conversations">
          <PanelLeftIcon />
        </Button>
      </SheetTrigger>
      <SheetContent side="left" className="gap-0 p-0 data-[side=left]:w-80">
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

/** From lg: shows or hides the docked conversation list (the choice is remembered). */
function DockedListToggle() {
  const list = useDockedConversationList();
  const Icon = list.open ? PanelLeftCloseIcon : PanelLeftOpenIcon;
  // The label names the action. (aria-expanded would also give the ghost button its
  // "menu open" background whenever the list is shown, which is most of the time.)
  const label = list.open ? 'Hide conversations' : 'Show conversations';

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="hidden lg:inline-flex"
          aria-label={label}
          aria-controls={list.id}
          onClick={() => list.setOpen(!list.open)}
        >
          <Icon />
        </Button>
      </TooltipTrigger>
      <TooltipContent side="bottom" align="start">
        {label}
      </TooltipContent>
    </Tooltip>
  );
}

/** Title row of the chat pane: the conversation list toggle, the title and the models in use. */
export function ChatHeader({ title }: { title: string }) {
  return (
    <header className="flex h-14 shrink-0 items-center gap-2 border-b px-3 sm:px-4">
      <ConversationsSheet />
      <DockedListToggle />
      <div className="grid min-w-0 flex-1 gap-0.5">
        <h1 className="truncate text-sm font-semibold">{title}</h1>
        <ProviderIndicator />
      </div>
    </header>
  );
}
