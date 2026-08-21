import { useEffect } from 'react';

/**
 * Resolves a signal token off the root element, URL-encoded for a data: URI.
 *
 * An SVG inside a data: URI is its own document and cannot resolve `var()`,
 * so the favicon has to read the computed token itself. The fallbacks are the
 * dark-theme values, used only if the stylesheet has not applied yet.
 */
function readSignal(name: string, fallback: string): string {
  const raw = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  return (raw || fallback).replace('#', '%23');
}

export function useLiveTitle(down: number) {
  useEffect(() => {
    const paint = () => {
      document.title = down > 0 ? `(${down} down) Device Monitoring` : 'Device Monitoring';

      const fill = down > 0 ? readSignal('--sig-down', '#ff3040') : readSignal('--sig-up', '#00e07a');
      const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"><circle cx="16" cy="16" r="13" fill="${fill}"/></svg>`;

      let link = document.querySelector<HTMLLinkElement>('link[rel="icon"]');
      if (!link) {
        link = document.createElement('link');
        link.rel = 'icon';
        document.head.appendChild(link);
      }
      link.href = `data:image/svg+xml,${svg}`;
    };

    paint();

    // Light and dark resolve --sig-* to different values, and a data: URI is
    // frozen at write time, so the icon must be repainted on every theme flip.
    const observer = new MutationObserver(paint);
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
    return () => observer.disconnect();
  }, [down]);
}
