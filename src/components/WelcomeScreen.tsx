export function WelcomeScreen({ onOpen }: { onOpen: () => void }) {
  return (
    <div className="welcome-screen">
      <div className="welcome-content">
        <h1>PDF Editor</h1>
        <p>Open a PDF file to get started</p>
        <button className="welcome-btn" onClick={onOpen}>
          📂 Open PDF
        </button>
        <div className="welcome-shortcuts">
          <p><kbd>Ctrl+O</kbd> Open file</p>
          <p><kbd>Ctrl+S</kbd> Save</p>
          <p><kbd>Ctrl+Shift+S</kbd> Save As</p>
          <p><kbd>Ctrl++</kbd> / <kbd>Ctrl+-</kbd> Zoom</p>
          <p><kbd>↑</kbd> / <kbd>↓</kbd> Navigate pages</p>
        </div>
      </div>
    </div>
  );
}
