import { act, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useStoredBoolean } from './use-stored-boolean';

const KEY = 'test.flag';

afterEach(() => {
  vi.restoreAllMocks();
  window.localStorage.clear();
});

describe('useStoredBoolean', () => {
  it('uses the fallback while nothing is stored', () => {
    const { result } = renderHook(() => useStoredBoolean(KEY, true));
    expect(result.current[0]).toBe(true);
  });

  it('stores a new value and returns it', () => {
    const { result } = renderHook(() => useStoredBoolean(KEY, true));
    act(() => result.current[1](false));
    expect(result.current[0]).toBe(false);
    expect(window.localStorage.getItem(KEY)).toBe('false');
  });

  it('reads a value stored earlier', () => {
    window.localStorage.setItem(KEY, 'false');
    const { result } = renderHook(() => useStoredBoolean(KEY, true));
    expect(result.current[0]).toBe(false);
  });

  it('keeps every reader of the same key in sync', () => {
    const first = renderHook(() => useStoredBoolean(KEY, true));
    const second = renderHook(() => useStoredBoolean(KEY, true));
    act(() => first.result.current[1](false));
    expect(second.result.current[0]).toBe(false);
  });

  it('still toggles, for this page only, when storage throws', () => {
    const blocked = () => {
      throw new DOMException('Storage is disabled', 'SecurityError');
    };
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(blocked);
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(blocked);

    const { result } = renderHook(() => useStoredBoolean('blocked.flag', true));
    expect(result.current[0]).toBe(true);
    act(() => result.current[1](false));
    expect(result.current[0]).toBe(false);
  });
});
