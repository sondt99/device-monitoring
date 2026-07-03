const REPO_URL = 'https://github.com/sondt99/device-monitoring';

export function Footer() {
  return (
    <footer className="app-footer">
      <span>Device Monitoring</span>
      <span aria-hidden="true">·</span>
      <a href={REPO_URL} target="_blank" rel="noreferrer">
        GitHub ↗
      </a>
    </footer>
  );
}
