import { useEffect } from 'react';

const LEAVE_MESSAGE = 'You have unsaved changes. Leave this page and lose them?';

/**
 * Warns before losing unsaved work: `beforeunload` for reloads, tab close and external
 * navigation, and a confirm on in-app link clicks (the App Router cannot block its own
 * navigations). The browser back button is not covered.
 */
export function useUnsavedChangesGuard(dirty: boolean): void {
  useEffect(() => {
    if (!dirty) return;

    function onBeforeUnload(event: BeforeUnloadEvent) {
      event.preventDefault();
      // Older browsers need returnValue set to show the prompt.
      event.returnValue = '';
    }

    function onClick(event: MouseEvent) {
      if (event.defaultPrevented || event.button !== 0) return;
      if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      const anchor = (event.target as Element | null)?.closest?.('a[href]');
      if (!(anchor instanceof HTMLAnchorElement)) return;
      if (anchor.target && anchor.target !== '_self') return;
      if (anchor.hasAttribute('download')) return;
      const url = new URL(anchor.href, window.location.href);
      if (url.origin !== window.location.origin) return;
      if (url.pathname === window.location.pathname && url.search === window.location.search)
        return;

      if (!window.confirm(LEAVE_MESSAGE)) {
        event.preventDefault();
        event.stopPropagation();
      }
    }

    window.addEventListener('beforeunload', onBeforeUnload);
    // Capture phase on window runs before React's handlers, so Next.js <Link> never sees it.
    window.addEventListener('click', onClick, true);
    return () => {
      window.removeEventListener('beforeunload', onBeforeUnload);
      window.removeEventListener('click', onClick, true);
    };
  }, [dirty]);
}
