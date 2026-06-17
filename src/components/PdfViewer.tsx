import { useEffect, useRef, useState, useCallback } from "react";
import * as pdfjsLib from "pdfjs-dist";
import workerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";
import { ToolMode } from "../App";

pdfjsLib.GlobalWorkerOptions.workerSrc = workerUrl;

interface PdfViewerProps {
  pdfData: Uint8Array;
  currentPage: number;
  zoom: number;
  toolMode: ToolMode;
  pageCount: number;
  onPageChange: (page: number) => void;
  onAnnotation: (ann: {
    type: string;
    pageIndex: number;
    x: number;
    y: number;
    w: number;
    h: number;
  }) => void;
  onStatus?: (msg: string) => void;
}

interface SelectionRect {
  startX: number;
  startY: number;
  endX: number;
  endY: number;
}

export function PdfViewer({
  pdfData,
  currentPage,
  zoom,
  toolMode,
  pageCount,
  onPageChange,
  onAnnotation,
  onStatus,
}: PdfViewerProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const textLayerRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [selection, setSelection] = useState<SelectionRect | null>(null);
  const [debugLines, setDebugLines] = useState<string[]>([]);
  const pdfDocRef = useRef<pdfjsLib.PDFDocumentProxy | null>(null);

  const addDebug = useCallback((msg: string) => {
    setDebugLines((prev) => [...prev, `${new Date().toISOString().slice(11, 23)} ${msg}`]);
    onStatus?.(msg);
  }, [onStatus]);

  useEffect(() => {
    addDebug(`MOUNTED pdfData=${pdfData?.length ?? "null"} bytes`);
  }, []);

  useEffect(() => {
    let cancelled = false;
    const loadDoc = async () => {
      try {
        addDebug(`pdf.js getDocument START (${pdfData.length} bytes)`);
        const data = pdfData.slice(0);
        const doc = await pdfjsLib.getDocument({ data }).promise;
        if (!cancelled) {
          pdfDocRef.current = doc;
          addDebug(`pdf.js getDocument OK numPages=${doc.numPages}`);
        } else {
          addDebug("pdf.js load CANCELLED");
        }
      } catch (err: any) {
        addDebug(`pdf.js LOAD FAILED: ${err?.message || err}`);
      }
    };
    loadDoc();
    return () => { cancelled = true; };
  }, [pdfData]);

  useEffect(() => {
    const doc = pdfDocRef.current;
    const canvas = canvasRef.current;
    if (!doc || !canvas) {
      addDebug(`RENDER SKIPPED doc=${!!doc} canvas=${!!canvas}`);
      return;
    }

    let cancelled = false;

    const renderPage = async () => {
      try {
        addDebug(`renderPage START page=${currentPage} zoom=${zoom}`);
        const page = await doc.getPage(currentPage);
        if (cancelled) return;

        const ctx = canvas.getContext("2d");
        if (!ctx) { addDebug("no 2d context"); return; }

        const scale = zoom * 1.5;
        const viewport = page.getViewport({ scale });

        canvas.width = viewport.width;
        canvas.height = viewport.height;
        ctx.clearRect(0, 0, canvas.width, canvas.height);

        addDebug(`canvas ${viewport.width}x${viewport.height}, calling render()...`);
        const renderTask = page.render({ canvasContext: ctx, viewport });
        await renderTask.promise;

        if (cancelled) return;
        addDebug(`render DONE`);
      } catch (err: any) {
        if (!cancelled) addDebug(`RENDER FAILED: ${err?.message || err}`);
      }
    };

    renderPage();
    return () => { cancelled = true; };
  }, [currentPage, zoom]);

  const getCanvasCoords = useCallback(
    (e: React.MouseEvent): { x: number; y: number } => {
      const canvas = canvasRef.current!;
      const rect = canvas.getBoundingClientRect();
      return {
        x: (e.clientX - rect.left) * (canvas.width / rect.width),
        y: (e.clientY - rect.top) * (canvas.height / rect.height),
      };
    },
    []
  );

  const handleCanvasMouseDown = useCallback(
    (e: React.MouseEvent) => {
      if (toolMode === "select" || toolMode === "pan" || toolMode === "eraser") return;
      const coords = getCanvasCoords(e);
      setSelection({ startX: coords.x, startY: coords.y, endX: coords.x, endY: coords.y });
    },
    [toolMode, getCanvasCoords]
  );

  const handleCanvasMouseMove = useCallback(
    (e: React.MouseEvent) => {
      if (!selection) return;
      const coords = getCanvasCoords(e);
      setSelection((prev) => prev ? { ...prev, endX: coords.x, endY: coords.y } : null);
    },
    [selection, getCanvasCoords]
  );

  const handleCanvasMouseUp = useCallback(() => {
    if (!selection) return;
    const viewportScale = 1 / 1.5;
    const x = Math.min(selection.startX, selection.endX) * viewportScale;
    const y = Math.min(selection.startY, selection.endY) * viewportScale;
    const w = Math.abs(selection.endX - selection.startX) * viewportScale;
    const h = Math.abs(selection.endY - selection.startY) * viewportScale;
    if (w > 5 && h > 5) {
      onAnnotation({ type: toolMode, pageIndex: currentPage - 1, x, y: canvasRef.current!.height * viewportScale - y - h, w, h });
    }
    setSelection(null);
  }, [selection, toolMode, currentPage, onAnnotation]);

  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === "ArrowDown" || e.key === "PageDown") { e.preventDefault(); onPageChange(Math.min(currentPage + 1, pageCount)); }
      if (e.key === "ArrowUp" || e.key === "PageUp") { e.preventDefault(); onPageChange(Math.max(currentPage - 1, 1)); }
      if (e.key === "Home") { e.preventDefault(); onPageChange(1); }
      if (e.key === "End") { e.preventDefault(); onPageChange(pageCount); }
    },
    [currentPage, pageCount, onPageChange]
  );

  useEffect(() => {
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [handleKeyDown]);

  return (
    <div ref={containerRef} className="pdf-viewer" style={{ cursor: toolMode === "pan" ? "grab" : toolMode === "select" ? "default" : "crosshair" }}>
      <div style={{
        position: "absolute", top: 0, right: 0, zIndex: 9999,
        background: "rgba(0,0,0,0.85)", color: "#0f0", fontFamily: "monospace",
        fontSize: 10, padding: 6, maxWidth: 400, maxHeight: 200, overflow: "auto",
        whiteSpace: "pre-wrap", wordBreak: "break-all", borderRadius: "0 0 0 6px",
      }}>
        {debugLines.length === 0 ? "waiting..." : debugLines.map((l, i) => <div key={i}>{l}</div>)}
      </div>
      <div className="pdf-page-container">
        <canvas
          ref={canvasRef}
          onMouseDown={handleCanvasMouseDown}
          onMouseMove={handleCanvasMouseMove}
          onMouseUp={handleCanvasMouseUp}
          onMouseLeave={() => selection && setSelection(null)}
        />
        <div ref={textLayerRef} className="text-layer" />
        {selection && (
          <div
            style={{
              position: "absolute",
              left: Math.min(selection.startX, selection.endX),
              top: Math.min(selection.startY, selection.endY),
              width: Math.abs(selection.endX - selection.startX),
              height: Math.abs(selection.endY - selection.startY),
              backgroundColor: toolMode === "redact" ? "#000" : "#ffeb3b88",
              border: `1px solid ${toolMode === "redact" ? "#000" : "#ffeb3b"}`,
              pointerEvents: "none",
            }}
          />
        )}
      </div>
    </div>
  );
}
