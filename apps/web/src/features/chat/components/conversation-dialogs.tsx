'use client';

import { type Conversation, updateConversationSchema } from '@repo/shared';
import { Loader2Icon } from 'lucide-react';
import { useId, useState } from 'react';
import { toast } from 'sonner';
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { getErrorMessage } from '@/lib/api-client';
import { useDeleteConversation, useRenameConversation } from '../queries';

/** Same limit as `updateConversationSchema` in @repo/shared. */
const TITLE_MAX = 120;

interface DialogProps {
  conversation: Conversation;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Where focus goes when the dialog closes (call preventDefault to take over). */
  onCloseAutoFocus?: (event: Event) => void;
}

/** Stays open (and busy) until the API answers. */
export function RenameConversationDialog({
  conversation,
  open,
  onOpenChange,
  onCloseAutoFocus,
}: DialogProps) {
  const rename = useRenameConversation();
  const [error, setError] = useState<string | null>(null);
  const inputId = useId();
  const errorId = useId();
  const pending = rename.isPending;

  function close(next: boolean) {
    if (pending) return;
    setError(null);
    onOpenChange(next);
  }

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const title = String(new FormData(event.currentTarget).get('title') ?? '');
    const parsed = updateConversationSchema.safeParse({ title });
    if (!parsed.success) {
      setError(
        title.trim()
          ? `Keep the title under ${TITLE_MAX} characters.`
          : 'Give the conversation a title.',
      );
      return;
    }
    if (parsed.data.title === conversation.title) {
      close(false);
      return;
    }
    rename.mutate(
      { id: conversation.id, title: parsed.data.title },
      {
        onSuccess: () => {
          onOpenChange(false);
          toast.success('Conversation renamed');
        },
        onError: (mutationError) => setError(getErrorMessage(mutationError)),
      },
    );
  }

  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogContent onCloseAutoFocus={onCloseAutoFocus}>
        <form onSubmit={handleSubmit} noValidate className="grid gap-4">
          <DialogHeader>
            <DialogTitle>Rename conversation</DialogTitle>
            <DialogDescription>
              A clear title makes the conversation easy to find later.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-2">
            <Label htmlFor={inputId}>Title</Label>
            <Input
              id={inputId}
              name="title"
              defaultValue={conversation.title}
              maxLength={TITLE_MAX}
              onFocus={(event) => event.currentTarget.select()}
              aria-invalid={error ? true : undefined}
              aria-describedby={error ? errorId : undefined}
            />
            {error && (
              <p id={errorId} className="text-sm text-destructive">
                {error}
              </p>
            )}
          </div>
          <DialogFooter>
            <DialogClose asChild>
              <Button type="button" variant="outline" disabled={pending}>
                Cancel
              </Button>
            </DialogClose>
            <Button type="submit" disabled={pending}>
              {pending && <Loader2Icon className="animate-spin" aria-hidden />}
              {pending ? 'Saving...' : 'Save'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/** The confirmation stays open (and busy) until the API answers. */
export function DeleteConversationDialog({
  conversation,
  open,
  onOpenChange,
  onCloseAutoFocus,
  onBeforeDelete,
  onDeleted,
}: DialogProps & { onBeforeDelete?: () => void; onDeleted?: () => void }) {
  const deleteConversation = useDeleteConversation();
  const pending = deleteConversation.isPending;

  function confirm() {
    onBeforeDelete?.();
    deleteConversation.mutate(conversation.id, {
      onSuccess: () => {
        onOpenChange(false);
        toast.success('Conversation deleted');
        onDeleted?.();
      },
      onError: (error) => {
        toast.error('Could not delete the conversation', { description: getErrorMessage(error) });
      },
    });
  }

  return (
    <AlertDialog open={open} onOpenChange={(next) => !pending && onOpenChange(next)}>
      <AlertDialogContent onCloseAutoFocus={onCloseAutoFocus}>
        <AlertDialogHeader>
          <AlertDialogTitle>Delete this conversation?</AlertDialogTitle>
          <AlertDialogDescription>
            &ldquo;{conversation.title}&rdquo; and all its messages will be deleted permanently.
            This cannot be undone.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={pending}>Cancel</AlertDialogCancel>
          <Button variant="destructive" onClick={confirm} disabled={pending}>
            {pending && <Loader2Icon className="animate-spin" aria-hidden />}
            {pending ? 'Deleting...' : 'Delete conversation'}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
