import { ToolMode } from "../App";

interface PdfToolbarProps {
  fileName: string;
  isModified: boolean;
  toolMode: ToolMode;
  zoom: number;
  currentPage: number;
  totalPages: number;
  showSidebar: boolean;
  onOpen: () => void;
  onSave: () => void;
  onSaveAs: () => void;
  onMerge: () => void;
  onToolChange: (mode: ToolMode) => void;
  onZoomIn: () => void;
  onZoomOut: () => void;
  onZoomReset: () => void;
  onToggleSidebar: () => void;
}

const tools: { mode: ToolMode; label: string; icon: string }[] = [
  { mode: "select", label: "Select", icon: "⬚" },
  { mode: "pan", label: "Pan", icon: "✋" },
  { mode: "highlight", label: "Highlight", icon: "🖍" },
  { mode: "text", label: "Text", icon: "T" },
  { mode: "draw", label: "Draw", icon: "✎" },
  { mode: "redact", label: "Redact", icon: "█" },
  { mode: "eraser", label: "Eraser", icon: "◻" },
];

export function PdfToolbar({
  fileName,
  isModified,
  toolMode,
  zoom,
  currentPage,
  totalPages,
  showSidebar,
  onOpen,
  onSave,
  onSaveAs,
  onMerge,
  onToolChange,
  onZoomIn,
  onZoomOut,
  onZoomReset,
  onToggleSidebar,
}: PdfToolbarProps) {
  return (
    <div className="toolbar">
      <div className="toolbar-section toolbar-left">
        <button className="toolbar-btn" onClick={onOpen} title="Open (Ctrl+O)">
          📂 Open
        </button>
        <button className="toolbar-btn" onClick={onSave} title="Save (Ctrl+S)">
          💾 Save
        </button>
        <button className="toolbar-btn" onClick={onSaveAs} title="Save As (Ctrl+Shift+S)">
          💾 Save As
        </button>
        <div className="toolbar-separator" />
        <button className="toolbar-btn" onClick={onMerge} title="Merge PDFs">
          📎 Merge
        </button>
        <div className="toolbar-separator" />
        <span className="file-name">
          {fileName || "No file"}{isModified ? " *" : ""}
        </span>
      </div>

      <div className="toolbar-section toolbar-center">
        {tools.map((t) => (
          <button
            key={t.mode}
            className={`toolbar-btn tool-btn ${toolMode === t.mode ? "active" : ""}`}
            onClick={() => onToolChange(t.mode)}
            title={t.label}
          >
            {t.icon}
          </button>
        ))}
      </div>

      <div className="toolbar-section toolbar-right">
        <button className="toolbar-btn" onClick={onToggleSidebar} title="Toggle Sidebar">
          {showSidebar ? "◀" : "▶"} Panel
        </button>
        <div className="toolbar-separator" />
        <button className="toolbar-btn" onClick={onZoomOut} title="Zoom Out (Ctrl+-)">
          −
        </button>
        <span className="zoom-label" onClick={onZoomReset} title="Reset Zoom">
          {Math.round(zoom * 100)}%
        </span>
        <button className="toolbar-btn" onClick={onZoomIn} title="Zoom In (Ctrl+=)">
          +
        </button>
        <div className="toolbar-separator" />
        <span className="page-info">
          {totalPages > 0 ? `${currentPage} / ${totalPages}` : "—"}
        </span>
      </div>
    </div>
  );
}
