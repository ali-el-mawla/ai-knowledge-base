import { useCallback, useEffect, useLayoutEffect, useMemo, useRef } from 'react';

/**
 * Delays calls to `fn` until `delayMs` have passed without a new call. The latest `fn` is
 * always used, so callers do not need to memoise it. Pending calls are dropped on unmount.
 */
export function useDebouncedCallback<Args extends unknown[]>(
  fn: (...args: Args) => void,
  delayMs: number,
) {
  const fnRef = useRef(fn);
  const timerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  useLayoutEffect(() => {
    fnRef.current = fn;
  });

  const cancel = useCallback(() => clearTimeout(timerRef.current), []);

  const schedule = useCallback(
    (...args: Args) => {
      clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => fnRef.current(...args), delayMs);
    },
    [delayMs],
  );

  useEffect(() => cancel, [cancel]);

  return useMemo(() => ({ schedule, cancel }), [schedule, cancel]);
}
