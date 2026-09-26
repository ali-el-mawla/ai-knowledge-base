import { useCallback, useSyncExternalStore } from 'react';

/**
 * Values that could not be written to localStorage (private mode, storage disabled or full).
 * They last until the page reloads, so a toggle still works where storage does not.
 */
const unsaved = new Map<string, string>();
/** Components of this tab that read a stored value (the `storage` event only reaches other tabs). */
const listeners = new Set<() => void>();

function read(key: string): string | null {
  if (unsaved.has(key)) return unsaved.get(key) ?? null;
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

function write(key: string, value: string) {
  try {
    window.localStorage.setItem(key, value);
    unsaved.delete(key);
  } catch {
    unsaved.set(key, value);
  }
  for (const listener of listeners) listener();
}

function subscribe(onChange: () => void) {
  listeners.add(onChange);
  window.addEventListener('storage', onChange);
  return () => {
    listeners.delete(onChange);
    window.removeEventListener('storage', onChange);
  };
}

/**
 * A yes/no preference remembered in localStorage, shared by every component that uses the
 * same key and kept in sync across tabs. The server render, and a browser with nothing
 * stored, use `fallback`.
 */
export function useStoredBoolean(
  key: string,
  fallback: boolean,
): [value: boolean, setValue: (value: boolean) => void] {
  const stored = useSyncExternalStore(
    subscribe,
    () => read(key),
    () => null,
  );
  const setValue = useCallback((value: boolean) => write(key, String(value)), [key]);
  return [stored === null ? fallback : stored === 'true', setValue];
}
