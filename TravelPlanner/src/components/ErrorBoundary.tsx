import { Component, type ReactNode } from 'react';

interface State { error: Error | null }

/**
 * Catches render errors so a single bug can't leave the user staring at a
 * blank white screen. Offers a reload; their data is safe on the device.
 */
export class ErrorBoundary extends Component<{ children: ReactNode }, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State { return { error }; }

  componentDidCatch(error: Error) { console.error('App error:', error); }

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div style={{
        minHeight: '100vh', display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'center', textAlign: 'center',
        padding: '2rem', gap: '0.75rem', background: '#0f172a', color: '#e8eef8',
        fontFamily: 'system-ui, sans-serif',
      }}>
        <div style={{ fontSize: '2.5rem' }}>🧭</div>
        <h1 style={{ fontSize: '1.25rem', fontWeight: 800, margin: 0 }}>Something hiccupped</h1>
        <p style={{ color: '#94a3b8', maxWidth: '20rem', margin: 0 }}>
          The app hit an unexpected error. Your trip data is safe on this device — a reload usually fixes it.
        </p>
        <button
          onClick={() => window.location.reload()}
          style={{
            marginTop: '0.5rem', padding: '0.75rem 1.5rem', borderRadius: '1rem',
            border: 'none', fontWeight: 700, color: '#0f172a', background: '#38bdf8', cursor: 'pointer',
          }}
        >
          Reload
        </button>
      </div>
    );
  }
}
