import { useEffect } from 'react';

export function useLiveTitle(down: number) {
  useEffect(() => {
    document.title = down > 0 ? `(${down} down) Device Monitoring` : 'Device Monitoring';

    const svg =
      down > 0
        ? '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"><circle cx="16" cy="16" r="14" fill="%23fb7185"/></svg>'
        : '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"><circle cx="16" cy="16" r="14" fill="%2334d399"/></svg>';

    let link = document.querySelector<HTMLLinkElement>('link[rel="icon"]');
    if (!link) {
      link = document.createElement('link');
      link.rel = 'icon';
      document.head.appendChild(link);
    }
    link.href = `data:image/svg+xml,${svg}`;
  }, [down]);
}
