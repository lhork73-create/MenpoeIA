import React, { Component, ReactNode } from 'react';

interface Props { children: ReactNode; fallback: ReactNode; }
interface State { hasError: boolean; }

export class WebGLErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(): State {
    return { hasError: true };
  }

  componentDidCatch(error: Error) {
    console.warn('[Avatar] 3D unavailable, switching to 2D portrait:', error.message);
  }

  render() {
    if (this.state.hasError) return this.props.fallback;
    return this.props.children;
  }
}

/**
 * Tests actual WebGL context creation with the same attributes Three.js uses.
 * More reliable than just checking `window.WebGLRenderingContext`.
 */
export function isWebGLAvailable(): boolean {
  try {
    const canvas = document.createElement('canvas');
    const ctx = (
      canvas.getContext('webgl2', { failIfMajorPerformanceCaveat: false }) ||
      canvas.getContext('webgl',  { failIfMajorPerformanceCaveat: false }) ||
      canvas.getContext('experimental-webgl', { failIfMajorPerformanceCaveat: false })
    ) as WebGLRenderingContext | null;
    if (!ctx) return false;
    if (ctx.isContextLost()) return false;
    // Verify we can actually use it
    ctx.getParameter(ctx.VERSION);
    return true;
  } catch {
    return false;
  }
}
