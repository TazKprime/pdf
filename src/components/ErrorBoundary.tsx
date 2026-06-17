import React, { Component, ErrorInfo, ReactNode } from "react";

interface Props {
  children: ReactNode;
}

interface State {
  error: Error | null;
  info: ErrorInfo | null;
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null, info: null };

  static getDerivedStateFromError(error: Error): State {
    return { error, info: null };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    this.setState({ info });
  }

  render() {
    if (this.state.error) {
      return (
        <div style={{
          position: "fixed", inset: 0, background: "#1e1e2e", color: "#f38ba8",
          padding: 24, fontFamily: "monospace", fontSize: 14, overflow: "auto", zIndex: 9999,
        }}>
          <h2 style={{ color: "#f38ba8", marginBottom: 12 }}>CRASH ERROR</h2>
          <pre style={{ color: "#f38ba8", whiteSpace: "pre-wrap" }}>{this.state.error.message}</pre>
          <pre style={{ color: "#a6adc8", whiteSpace: "pre-wrap", marginTop: 12 }}>{this.state.error.stack}</pre>
          {this.state.info && (
            <pre style={{ color: "#6c7086", whiteSpace: "pre-wrap", marginTop: 12 }}>{this.state.info.componentStack}</pre>
          )}
        </div>
      );
    }
    return this.props.children;
  }
}
