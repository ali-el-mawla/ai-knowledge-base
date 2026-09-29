'use client';

import type { Document } from '@repo/shared';
import { Loader2Icon, Trash2Icon } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { getErrorMessage } from '@/lib/api-client';
import { pluralize } from '@/lib/format';
import { useDeleteDocument } from '../queries';

/** The confirmation stays open (and busy) until the API answers. */
export function DeleteDocumentButton({
  document,
  onDeleted,
}: {
  document: Document;
  onDeleted: () => void;
}) {
  const [open, setOpen] = useState(false);
  const deleteDocument = useDeleteDocument();
  const pending = deleteDocument.isPending;
  const chunkCount = document.ingestion.chunkCount;

  function confirm() {
    deleteDocument.mutate(document.id, {
      onSuccess: () => {
        setOpen(false);
        toast.success('Document deleted');
        onDeleted();
      },
      onError: (error) => {
        toast.error('Could not delete the document', { description: getErrorMessage(error) });
      },
    });
  }

  return (
    <AlertDialog open={open} onOpenChange={(next) => !pending && setOpen(next)}>
      <AlertDialogTrigger asChild>
        <Button
          variant="ghost"
          className="text-destructive hover:text-destructive"
          aria-label="Delete document"
        >
          <Trash2Icon aria-hidden />
          <span className="hidden sm:inline">Delete</span>
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Delete this document?</AlertDialogTitle>
          <AlertDialogDescription>
            &ldquo;{document.title}&rdquo;
            {chunkCount > 0 ? ` and its ${pluralize(chunkCount, 'chunk')}` : ''} will be deleted
            permanently. Chat can no longer use it as a source. This cannot be undone.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={pending}>Cancel</AlertDialogCancel>
          <Button variant="destructive" onClick={confirm} disabled={pending}>
            {pending && <Loader2Icon className="animate-spin" aria-hidden />}
            {pending ? 'Deleting...' : 'Delete document'}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
