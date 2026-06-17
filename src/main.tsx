import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import { ErrorBoundary } from "./components/ErrorBoundary";
import "./styles.css";

const logs: string[] = [];
const origLog = console.log;
const origWarn = console.warn;
const origError = console.error;

function stamp() {
  return new Date().toISOString().split("T")[1].slice(0, 12);
}

console.log = (...args: any[]) => {
  logs.push(`[${stamp()}] LOG: ${args.join(" ")}`);
  origLog.apply(console, args);
};
console.warn = (...args: any[]) => {
  logs.push(`[${stamp()}] WARN: ${args.join(" ")}`);
  origWarn.apply(console, args);
};
console.error = (...args: any[]) => {
  logs.push(`[${stamp()}] ERR: ${args.join(" ")}`);
  origError.apply(console, args);
};

window.addEventListener("error", (e) => {
  logs.push(`[${stamp()}] UNCAUGHT: ${e.message} at ${e.filename}:${e.lineno}:${e.colno}`);
});
window.addEventListener("unhandledrejection", (e) => {
  logs.push(`[${stamp()}] UNHANDLED PROMISE: ${e.reason}`);
});

function DebugOverlay() {
  const [visible, setVisible] = React.useState(false);
  const [entries, setEntries] = React.useState<string[]>([]);

  React.useEffect(() => {
    const iv = setInterval(() => setEntries([...logs]), 500);
    return () => clearInterval(iv);
  }, []);

  return (
    <>
      <button
        onClick={() => setVisible((v) => !v)}
        style={{
          position: "fixed", bottom: 8, right: 8, zIndex: 10000,
          background: "#f38ba8", color: "#1e1e2e", border: "none",
          borderRadius: 4, padding: "4px 10px", cursor: "pointer",
          fontFamily: "monospace", fontSize: 11, fontWeight: "bold",
        }}
      >
        DEBUG ({logs.length})
      </button>
      {visible && (
        <div style={{
          position: "fixed", bottom: 36, right: 8, width: 600, maxHeight: 400,
          background: "#11111b", color: "#cdd6f4", border: "1px solid #45475a",
          borderRadius: 6, overflow: "auto", zIndex: 10000, padding: 8,
          fontFamily: "monospace", fontSize: 11,
        }}>
          <div style={{ color: "#6c7086", marginBottom: 4, borderBottom: "1px solid #45475a", paddingBottom: 4 }}>
            Debug Log ({logs.length} entries)
          </div>
          {entries.length === 0 && <div>No logs yet</div>}
          {entries.map((e, i) => (
            <div key={i} style={{ whiteSpace: "pre-wrap", wordBreak: "break-all", padding: "1px 0",
              color: e.includes("ERR") || e.includes("UNCAUGHT") || e.includes("UNHANDLED") ? "#f38ba8"
                : e.includes("WARN") ? "#f9e2af" : "#cdd6f4",
            }}>{e}</div>
          ))}
        </div>
      )}
    </>
  );
}

const root = document.getElementById("root");

if (root) {
  ReactDOM.createRoot(root).render(
    <React.StrictMode>
      <ErrorBoundary>
        <App />
        <DebugOverlay />
      </ErrorBoundary>
    </React.StrictMode>
  );
} else {
  document.body.innerHTML = `
    <div style="background:#1e1e2e;color:#f38ba8;padding:40px;font-family:monospace">
      <h1>FATAL: #root element not found</h1>
      <p>index.html does not contain a div#root element.</p>
    </div>
  `;
}
