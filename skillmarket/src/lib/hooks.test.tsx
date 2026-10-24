// @vitest-environment jsdom
import { act, renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { useInstallPrompt } from './useInstallPrompt';
import { useOnline } from './useOnline';

function installEvent() {
  const e = new Event('beforeinstallprompt', { cancelable: true }) as Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: string }> };
  e.prompt = vi.fn(async () => undefined);
  e.userChoice = Promise.resolve({ outcome: 'accepted' });
  return e;
}

describe('useInstallPrompt', () => {
  it('captures the browser prompt, shows our own install button, and clears it after use', async () => {
    const { result } = renderHook(() => useInstallPrompt());
    expect(result.current.canInstall).toBe(false);
    const e = installEvent();
    act(() => { window.dispatchEvent(e); });
    expect(e.defaultPrevented).toBe(true);                              // the default mini-infobar is suppressed
    expect(result.current.canInstall).toBe(true);
    await act(async () => { await result.current.install(); });
    expect(e.prompt).toHaveBeenCalledTimes(1);
    expect(result.current.canInstall).toBe(false);
  });

  it('hides the button once the app has been installed', () => {
    const { result } = renderHook(() => useInstallPrompt());
    act(() => { window.dispatchEvent(installEvent()); });
    expect(result.current.canInstall).toBe(true);
    act(() => { window.dispatchEvent(new Event('appinstalled')); });
    expect(result.current.canInstall).toBe(false);
  });

  it('install() does nothing when there is no prompt', async () => {
    const { result } = renderHook(() => useInstallPrompt());
    await expect(result.current.install()).resolves.toBeUndefined();
  });
});

describe('useOnline', () => {
  it('follows the browser online and offline events', () => {
    const { result } = renderHook(() => useOnline());
    expect(result.current).toBe(true);
    act(() => { window.dispatchEvent(new Event('offline')); });
    expect(result.current).toBe(false);
    act(() => { window.dispatchEvent(new Event('online')); });
    expect(result.current).toBe(true);
  });
});
