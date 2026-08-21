import { renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import { useLiveFavicon } from '../lib/useLiveFavicon.js';

const DOWN = '%23ff3040';
const UP = '%2300e07a';

function faviconHref(): string {
  return document.querySelector<HTMLLinkElement>('link[rel="icon"]')?.getAttribute('href') ?? '';
}

describe('useLiveFavicon', () => {
  beforeEach(() => {
    document.title = 'Device Monitoring';
    document.querySelector('link[rel="icon"]')?.remove();
  });

  // The count used to be written into document.title, where it stayed legible
  // on the unauthenticated login page after the shell unmounted. Health is
  // reported by the favicon alone now, and the title must stay constant.
  it('never touches the tab title, whatever the outage count', () => {
    const view = renderHook(() => useLiveFavicon(4));
    expect(document.title).toBe('Device Monitoring');
    view.unmount();
    expect(document.title).toBe('Device Monitoring');
  });

  it('shows the down signal while devices are failing', () => {
    renderHook(() => useLiveFavicon(2));
    expect(faviconHref()).toContain(DOWN);
  });

  it('shows the up signal when nothing is down', () => {
    renderHook(() => useLiveFavicon(0));
    expect(faviconHref()).toContain(UP);
  });

  it('goes neutral once the authenticated shell unmounts', () => {
    const view = renderHook(() => useLiveFavicon(3));
    expect(faviconHref()).toContain(DOWN);

    view.unmount();

    const href = faviconHref();
    expect(href).not.toContain(DOWN);
    expect(href).not.toContain(UP);
  });
});
