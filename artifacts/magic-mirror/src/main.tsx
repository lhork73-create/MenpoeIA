import React, { Component, ReactNode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import "./index.css";

class AppErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  constructor(props: { children: ReactNode }) {
    super(props);
    this.state = { error: null };
  }
  static getDerivedStateFromError(error: Error) { return { error }; }
  render() {
    if (this.state.error) {
      return (
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          width: '100vw', height: '100vh', background: '#050a12',
          color: '#7dd3fc', fontFamily: 'monospace', flexDirection: 'column', gap: 16,
        }}>
          <div style={{ fontSize: 32 }}>🔮</div>
          <div style={{ fontSize: 14, opacity: 0.7 }}>Error al cargar Magic Mirror</div>
          <button
            onClick={() => { this.setState({ error: null }); window.location.reload(); }}
            style={{ marginTop: 8, padding: '8px 20px', borderRadius: 20, border: '1px solid #7dd3fc44',
              background: 'transparent', color: '#7dd3fc', cursor: 'pointer', fontSize: 12 }}>
            Reintentar
          </button>
          <pre style={{ fontSize: 10, opacity: 0.4, maxWidth: 480, whiteSpace: 'pre-wrap' }}>
            {this.state.error.message}
          </pre>
        </div>
      );
    }
    return this.props.children;
  }
}

createRoot(document.getElementById("root")!).render(
  <AppErrorBoundary>
    <App />
  </AppErrorBoundary>
);
