import { renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import { useLiveTitle } from '../lib/useLiveTitle.js';

function faviconHref(): string {
  return document.querySelector<HTMLLinkElement>('link[rel="icon"]')?.getAttribute('href') ?? '';
}

describe('useLiveTitle', () => {
  beforeEach(() => {
    document.title = 'Device Monitoring';
    document.querySelector('link[rel="icon"]')?.remove();
  });

  it('surfaces the outage count so a backgrounded tab still reports it', () => {
    renderHook(() => useLiveTitle(2));
    expect(document.title).toBe('(2 down) Device Monitoring');
    expect(faviconHref()).toContain('%23ff3040');
  });

  it('shows the plain title and a green dot when nothing is down', () => {
    renderHook(() => useLiveTitle(0));
    expect(document.title).toBe('Device Monitoring');
    expect(faviconHref()).toContain('%2300e07a');
  });

  // The tab title and favicon are document-level state that outlives the
  // component. AppShell sits behind RequireAuth, so logging out or letting a
  // session expire unmounts it and renders /login — and without this reset the
  // unauthenticated login page keeps advertising the fleet's failure count to
  // whoever is next at that machine.
  it('stops reporting the count once the authenticated shell unmounts', () => {
    const view = renderHook(() => useLiveTitle(3));
    expect(document.title).toBe('(3 down) Device Monitoring');

    view.unmount();

    expect(document.title).toBe('Device Monitoring');
    expect(faviconHref()).not.toContain('%23ff3040');
  });

  it('leaves a neutral favicon behind rather than a stale signal colour', () => {
    const view = renderHook(() => useLiveTitle(1));
    view.unmount();
    const href = faviconHref();
    expect(href).not.toContain('%23ff3040');
    expect(href).not.toContain('%2300e07a');
  });
});
