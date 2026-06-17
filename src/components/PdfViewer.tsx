import { useEffect, useRef, useState, useCallback } from "react";
import * as pdfjsLib from "pdfjs-dist";
import { ToolMode } from "../App";

pdfjsLib.GlobalWorkerOptions.workerSrc = "";

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
  const [docReady, setDocReady] = useState(false);
  const pdfDocRef = useRef<pdfjsLib.PDFDocumentProxy | null>(null);

  useEffect(() => {
    let cancelled = false;
    setDocReady(false);

    const loadDoc = async () => {
      try {
        onStatus?.("pdf.js: loading document...");
        const data = pdfData.slice(0);
        const doc = await pdfjsLib.getDocument({ data }).promise;
        if (!cancelled) {
          pdfDocRef.current = doc;
          onStatus?.(`pdf.js: doc loaded, ${doc.numPages} pages`);
          setDocReady(true);
        }
      } catch (err) {
        onStatus?.(`pdf.js LOAD ERROR: ${err}`);
        console.error("PDF load error:", err);
      }
    };
    loadDoc();
    return () => { cancelled = true; };
  }, [pdfData]);

  useEffect(() => {
    if (!docReady) return;

    const doc = pdfDocRef.current;
    const canvas = canvasRef.current;
    if (!doc || !canvas) return;

    let cancelled = false;

    const renderPage = async () => {
      try {
        onStatus?.(`pdf.js: rendering page ${currentPage} at zoom ${zoom}...`);
        const page = await doc.getPage(currentPage);
        if (cancelled) return;

        const ctx = canvas.getContext("2d");
        if (!ctx) { onStatus?.("pdf.js: no 2d context"); return; }

        const scale = zoom * 1.5;
        const viewport = page.getViewport({ scale });

        canvas.width = viewport.width;
        canvas.height = viewport.height;

        ctx.clearRect(0, 0, canvas.width, canvas.height);

        const renderTask = page.render({ canvasContext: ctx, viewport });
        await renderTask.promise;

        if (cancelled) return;
        onStatus?.(`pdf.js: page ${currentPage} rendered OK (${viewport.width}x${viewport.height})`);

        if (textLayerRef.current) {
          textLayerRef.current.innerHTML = "";
          textLayerRef.current.style.width = `${viewport.width}px`;
          textLayerRef.current.style.height = `${viewport.height}px`;

          try {
            const textContent = await page.getTextContent();
            for (const item of textContent.items as any[]) {
              if (!item.str) continue;
              const tx = pdfjsLib.Util.transform(viewport.transform, item.transform);
              const span = document.createElement("span");
              span.textContent = item.str;
              span.style.left = `${tx[4]}px`;
              span.style.top = `${tx[5] - item.height * scale}px`;
              span.style.fontSize = `${item.height * scale}px`;
              span.style.fontFamily = "sans-serif";
              span.style.position = "absolute";
              span.style.whiteSpace = "pre";
              span.style.color = "transparent";
              span.style.pointerEvents = "none";
              textLayerRef.current.appendChild(span);
            }
          } catch { /* text extraction not critical */ }
        }
      } catch (err) {
        if (!cancelled) {
          onStatus?.(`pdf.js RENDER ERROR: ${err}`);
          console.error("Render error:", err);
        }
      }
    };

    renderPage();
    return () => { cancelled = true; };
  }, [docReady, currentPage, zoom]);

  const getCanvasCoords = useCallback(
    (e: React.MouseEvent): { x: number; y: number } => {
      const canvas = canvasRef.current!;
      const rect = canvas.getBoundingClientRect();
      const scaleX = canvas.width / rect.width;
      const scaleY = canvas.height / rect.height;
      return {
        x: (e.clientX - rect.left) * scaleX,
        y: (e.clientY - rect.top) * scaleY,
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
      setSelection((prev) =>
        prev ? { ...prev, endX: coords.x, endY: coords.y } : null
      );
    },
    [selection, getCanvasCoords]
  );

  const handleCanvasMouseUp = useCallback(() => {
    if (!selection) return;
    const canvas = canvasRef.current!;
    const viewportScale = 1 / 1.5;
    const x = Math.min(selection.startX, selection.endX) * viewportScale;
    const y = Math.min(selection.startY, selection.endY) * viewportScale;
    const w = Math.abs(selection.endX - selection.startX) * viewportScale;
    const h = Math.abs(selection.endY - selection.startY) * viewportScale;

    if (w > 5 && h > 5) {
      onAnnotation({
        type: toolMode,
        pageIndex: currentPage - 1,
        x,
        y: canvas.height * viewportScale - y - h,
        w,
        h,
      });
    }
    setSelection(null);
  }, [selection, toolMode, currentPage, onAnnotation]);

  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === "ArrowDown" || e.key === "PageDown") {
        e.preventDefault();
        onPageChange(Math.min(currentPage + 1, pageCount));
      }
      if (e.key === "ArrowUp" || e.key === "PageUp") {
        e.preventDefault();
        onPageChange(Math.max(currentPage - 1, 1));
      }
      if (e.key === "Home") {
        e.preventDefault();
        onPageChange(1);
      }
      if (e.key === "End") {
        e.preventDefault();
        onPageChange(pageCount);
      }
    },
    [currentPage, pageCount, onPageChange]
  );

  useEffect(() => {
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [handleKeyDown]);

  const getCursor = () => {
    switch (toolMode) {
      case "pan": return "grab";
      case "highlight":
      case "text":
      case "draw":
      case "redact": return "crosshair";
      case "eraser": return "cell";
      default: return "default";
    }
  };

  return (
    <div ref={containerRef} className="pdf-viewer" style={{ cursor: getCursor() }}>
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
            className="selection-overlay"
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
