import React from 'react';
import ReactDOM from 'react-dom/client';
import './fonts';
import './styles.css';
import App from './App';

// After a new version is published, files of the old version disappear. If a page that was
// already open asks for one of them, reload once to pick up the new version instead of failing.
window.addEventListener('vite:preloadError', (e) => {
  const last = +(sessionStorage.getItem('sc-reloaded') || 0);
  if (Date.now() - last > 30000) {
    sessionStorage.setItem('sc-reloaded', String(Date.now()));
    e.preventDefault();
    location.reload();
  }
});

class Guard extends React.Component<{ children: React.ReactNode }, { error: Error | null }> {
  state = { error: null as Error | null };
  static getDerivedStateFromError(error: Error) { return { error }; }
  componentDidCatch(error: Error) { console.error('StoryCut crashed:', error); }
  render() {
    const { error } = this.state;
    if (!error) return this.props.children;
    const stale = /dynamically imported module|Failed to fetch|Importing a module script failed|ChunkLoadError|preload/i.test(String(error.message));
    return (
      <div style={{ maxWidth: 560, margin: '12vh auto', padding: 24, fontFamily: 'system-ui, sans-serif', border: '1px solid #dfe7e1', borderRadius: 14, background: '#fff' }}>
        <h2 style={{ marginTop: 0 }}>{stale ? 'StoryCut Studio was updated' : 'Something went wrong'}</h2>
        <p>{stale ? 'A newer version was published while this page was open. Reload to continue — your saved projects are safe.' : 'The page hit an error. Reload to continue — your saved projects (📁 Projects) are safe.'}</p>
        <button onClick={() => location.reload()} style={{ padding: '10px 18px', borderRadius: 10, border: 0, background: '#4f8f63', color: '#fff', fontSize: 15, cursor: 'pointer' }}>↻ Reload</button>
        <details style={{ marginTop: 16, color: '#667' }}><summary>Error details</summary><pre style={{ whiteSpace: 'pre-wrap', fontSize: 12 }}>{String(error.stack || error.message)}</pre></details>
      </div>
    );
  }
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <Guard><App /></Guard>
  </React.StrictMode>,
);
