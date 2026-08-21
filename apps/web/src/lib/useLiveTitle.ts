import { useEffect } from 'react';

const BASE_TITLE = 'Device Monitoring';

/**
 * Resolves a design token off the root element, URL-encoded for a data: URI.
 *
 * An SVG inside a data: URI is its own document and cannot resolve `var()`,
 * so the favicon has to read the computed token itself. The fallbacks are the
 * dark-theme values, used only if the stylesheet has not applied yet.
 */
function readToken(name: string, fallback: string): string {
  const raw = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  return (raw || fallback).replace('#', '%23');
}

function paintFavicon(fill: string): void {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"><circle cx="16" cy="16" r="13" fill="${fill}"/></svg>`;
  let link = document.querySelector<HTMLLinkElement>('link[rel="icon"]');
  if (!link) {
    link = document.createElement('link');
    link.rel = 'icon';
    document.head.appendChild(link);
  }
  link.href = `data:image/svg+xml,${svg}`;
}

export function useLiveTitle(down: number) {
  useEffect(() => {
    const paint = () => {
      document.title = down > 0 ? `(${down} down) ${BASE_TITLE}` : BASE_TITLE;
      paintFavicon(down > 0 ? readToken('--sig-down', '#ff3040') : readToken('--sig-up', '#00e07a'));
    };

    paint();

    // Light and dark resolve --sig-* to different values, and a data: URI is
    // frozen at write time, so the icon must be repainted on every theme flip.
    const observer = new MutationObserver(paint);
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
    return () => observer.disconnect();
  }, [down]);

  // Separate effect with no deps so this runs on real unmount only, not on
  // every change to `down`.
  //
  // The title and favicon are document-level state that outlives this hook.
  // AppShell renders behind RequireAuth, so logging out — or a session simply
  // expiring — unmounts it and shows /login. Without this reset the tab would
  // go on advertising the fleet's failure count on an unauthenticated page,
  // for whoever is next at that machine. Reset to the neutral token rather
  // than a signal colour: logged out means no reading, not a good one.
  useEffect(
    () => () => {
      document.title = BASE_TITLE;
      paintFavicon(readToken('--fg-muted', '#a3a3a3'));
    },
    []
  );
}
