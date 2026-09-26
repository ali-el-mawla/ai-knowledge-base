import type { Conversation, ConversationWithMessages, Message } from '@repo/shared';
import {
  type QueryClient,
  useMutation,
  useMutationState,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';
import {
  createConversation,
  deleteConversation,
  getAiInfo,
  getConversation,
  listConversations,
  renameConversation,
} from './api';

/** Query keys, from broad to narrow, so one invalidation can target a whole family. */
export const chatKeys = {
  all: ['conversations'] as const,
  lists: () => [...chatKeys.all, 'list'] as const,
  details: () => [...chatKeys.all, 'detail'] as const,
  detail: (id: string) => [...chatKeys.details(), id] as const,
};

export const aiKeys = {
  info: ['ai', 'info'] as const,
};

const DELETE_CONVERSATION_KEY = [...chatKeys.all, 'delete'] as const;

/** The configured models only change when the API restarts. */
const AI_INFO_STALE_MS = 5 * 60_000;

export function useConversations() {
  return useQuery({
    queryKey: chatKeys.lists(),
    queryFn: ({ signal }) => listConversations(signal),
  });
}

/**
 * The title as the sidebar knows it. The API renames a conversation after its first
 * question, and the list is what gets refreshed then, so it is fresher than the detail.
 */
export function useConversationTitle(id: string): string | undefined {
  const { data } = useQuery({
    queryKey: chatKeys.lists(),
    queryFn: ({ signal }) => listConversations(signal),
    select: (items) => items.find((item) => item.id === id)?.title,
  });
  return data;
}

/** True once this conversation was deleted in this tab (by any delete button). */
export function useIsConversationDeleted(id: string): boolean {
  const deletedIds = useMutationState({
    filters: { mutationKey: DELETE_CONVERSATION_KEY, status: 'success' },
    select: (mutation) => mutation.state.variables as string,
  });
  return deletedIds.includes(id);
}

export function useConversation(id: string) {
  // A deleted conversation's page is about to navigate away: do not refetch it (a 404).
  const deleted = useIsConversationDeleted(id);
  return useQuery({
    queryKey: chatKeys.detail(id),
    queryFn: ({ signal }) => getConversation(id, signal),
    enabled: !deleted,
  });
}

export function useAiInfo() {
  return useQuery({
    queryKey: aiKeys.info,
    queryFn: ({ signal }) => getAiInfo(signal),
    staleTime: AI_INFO_STALE_MS,
  });
}

/** Appends messages that are not in the list yet (matched by id), keeping the order. */
export function mergeMessages(current: Message[], incoming: readonly Message[]): Message[] {
  const known = new Set(current.map((message) => message.id));
  const added = incoming.filter((message) => !known.has(message.id));
  return added.length === 0 ? current : [...current, ...added];
}

/** Writes messages of a finished turn into the cached conversation, if it is cached. */
export function addMessagesToCache(
  queryClient: QueryClient,
  conversationId: string,
  messages: readonly Message[],
) {
  queryClient.setQueryData<ConversationWithMessages>(
    chatKeys.detail(conversationId),
    (current) =>
      current && {
        ...current,
        messages: mergeMessages(current.messages, messages),
      },
  );
}

/**
 * Marks the cached conversation as outdated without refetching now: the next visit loads
 * the server's copy. Used after a stop, when the server is still saving the partial answer.
 */
export function markConversationStale(queryClient: QueryClient, conversationId: string) {
  return queryClient.invalidateQueries({
    queryKey: chatKeys.detail(conversationId),
    refetchType: 'none',
  });
}

export function refetchConversation(queryClient: QueryClient, conversationId: string) {
  return queryClient.invalidateQueries({ queryKey: chatKeys.detail(conversationId) });
}

/** Titles and the recent-first order change with every message. */
export function refetchConversationList(queryClient: QueryClient) {
  return queryClient.invalidateQueries({ queryKey: chatKeys.lists() });
}

function updateListItem(queryClient: QueryClient, conversation: Conversation) {
  queryClient.setQueryData<Conversation[]>(chatKeys.lists(), (items) =>
    items?.map((item) => (item.id === conversation.id ? conversation : item)),
  );
}

/**
 * Creates an empty conversation and seeds its detail cache, so its page renders at once
 * (with the answer that is about to stream) instead of loading an empty history.
 */
export function useCreateConversation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => createConversation(),
    onSuccess: (conversation) => {
      queryClient.setQueryData<ConversationWithMessages>(chatKeys.detail(conversation.id), {
        conversation,
        messages: [],
      });
      queryClient.setQueryData<Conversation[]>(chatKeys.lists(), (items) =>
        items ? [conversation, ...items] : items,
      );
      void refetchConversationList(queryClient);
    },
  });
}

export function useRenameConversation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, title }: { id: string; title: string }) => renameConversation(id, { title }),
    onSuccess: (conversation) => {
      updateListItem(queryClient, conversation);
      queryClient.setQueryData<ConversationWithMessages>(
        chatKeys.detail(conversation.id),
        (current) => current && { ...current, conversation },
      );
      void refetchConversationList(queryClient);
    },
  });
}

/**
 * Deletes a conversation and drops its cached history. `useConversation` stops fetching a
 * deleted id, so the page still showing it does not refetch (and 404) before it navigates.
 */
export function useDeleteConversation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationKey: DELETE_CONVERSATION_KEY,
    mutationFn: (id: string) => deleteConversation(id),
    onSuccess: (_result, id) => {
      queryClient.setQueryData<Conversation[]>(chatKeys.lists(), (items) =>
        items?.filter((item) => item.id !== id),
      );
      queryClient.removeQueries({ queryKey: chatKeys.detail(id) });
      void refetchConversationList(queryClient);
    },
  });
}
