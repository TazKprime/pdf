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
    text?: string;
    points?: { x: number; y: number }[];
  }) => void;
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
}: PdfViewerProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const overlayCanvasRef = useRef<HTMLCanvasElement>(null);
  const textLayerRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const selectionRef = useRef<SelectionRect | null>(null);
  const drawPointsRef = useRef<{ x: number; y: number }[]>([]);
  const isDrawingRef = useRef(false);
  const pdfDocRef = useRef<pdfjsLib.PDFDocumentProxy | null>(null);
  const viewportScaleRef = useRef(1.5);
  const canvasSizeRef = useRef({ w: 0, h: 0 });
  const toolModeRef = useRef(toolMode);
  const currentPageRef = useRef(currentPage);
  const onAnnotationRef = useRef(onAnnotation);
  const zoomRef = useRef(zoom);
  const rerenderRef = useRef(0);
  const [, forceUpdate] = useState(0);

  toolModeRef.current = toolMode;
  currentPageRef.current = currentPage;
  onAnnotationRef.current = onAnnotation;
  zoomRef.current = zoom;

  useEffect(() => {
    let cancelled = false;
    const loadDoc = async () => {
      try {
        const data = pdfData.slice(0);
        const doc = await pdfjsLib.getDocument({ data }).promise;
        if (!cancelled) pdfDocRef.current = doc;
      } catch (err) {
        console.error("PDF load error:", err);
      }
    };
    loadDoc();
    return () => { cancelled = true; };
  }, [pdfData]);

  useEffect(() => {
    const doc = pdfDocRef.current;
    const canvas = canvasRef.current;
    if (!doc || !canvas) return;

    let cancelled = false;

    const renderPage = async () => {
      try {
        const page = await doc.getPage(currentPage);
        if (cancelled) return;
        const ctx = canvas.getContext("2d");
        if (!ctx) return;
        const scale = zoom * 1.5;
        viewportScaleRef.current = scale;
        const viewport = page.getViewport({ scale });
        canvas.width = viewport.width;
        canvas.height = viewport.height;
        canvasSizeRef.current = { w: viewport.width, h: viewport.height };

        const overlay = overlayCanvasRef.current;
        if (overlay) { overlay.width = viewport.width; overlay.height = viewport.height; }

        ctx.clearRect(0, 0, canvas.width, canvas.height);
        const renderTask = page.render({ canvasContext: ctx, viewport });
        await renderTask.promise;

        if (cancelled) return;

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
      } catch (err: any) {
        console.error("Render error:", err);
      }
    };

    renderPage();
    return () => { cancelled = true; };
  }, [currentPage, zoom]);

  const drawOverlay = useCallback(() => {
    const overlay = overlayCanvasRef.current;
    if (!overlay) return;
    const ctx = overlay.getContext("2d");
    if (!ctx) return;
    ctx.clearRect(0, 0, overlay.width, overlay.height);

    const sel = selectionRef.current;
    if (sel) {
      const x = Math.min(sel.startX, sel.endX);
      const y = Math.min(sel.startY, sel.endY);
      const w = Math.abs(sel.endX - sel.startX);
      const h = Math.abs(sel.endY - sel.startY);
      ctx.fillStyle = toolModeRef.current === "redact" ? "rgba(0,0,0,0.8)" : "rgba(255,235,59,0.35)";
      ctx.fillRect(x, y, w, h);
      ctx.strokeStyle = toolModeRef.current === "redact" ? "#000" : "#ffeb3b";
      ctx.lineWidth = 2;
      ctx.strokeRect(x, y, w, h);
    }

    const pts = drawPointsRef.current;
    if (pts.length > 1) {
      ctx.beginPath();
      ctx.moveTo(pts[0].x, pts[0].y);
      for (let i = 1; i < pts.length; i++) {
        ctx.lineTo(pts[i].x, pts[i].y);
      }
      ctx.strokeStyle = toolModeRef.current === "eraser" ? "#fff" : "#f38ba8";
      ctx.lineWidth = toolModeRef.current === "eraser" ? 20 : 3;
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      ctx.stroke();
    }
  }, []);

  const getCanvasCoords = useCallback((e: React.MouseEvent): { x: number; y: number } => {
    const canvas = canvasRef.current!;
    const rect = canvas.getBoundingClientRect();
    return {
      x: (e.clientX - rect.left) * (canvas.width / rect.width),
      y: (e.clientY - rect.top) * (canvas.height / rect.height),
    };
  }, []);

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    const mode = toolModeRef.current;
    if (mode === "select" || mode === "pan") return;
    const coords = getCanvasCoords(e);

    if (mode === "draw" || mode === "eraser") {
      isDrawingRef.current = true;
      drawPointsRef.current = [coords];
      return;
    }

    if (mode === "highlight" || mode === "redact" || mode === "text") {
      selectionRef.current = { startX: coords.x, startY: coords.y, endX: coords.x, endY: coords.y };
    }
  }, [getCanvasCoords]);

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    const coords = getCanvasCoords(e);
    const mode = toolModeRef.current;

    if ((mode === "draw" || mode === "eraser") && isDrawingRef.current) {
      drawPointsRef.current = [...drawPointsRef.current, coords];
      drawOverlay();
      return;
    }

    if (selectionRef.current) {
      selectionRef.current = { ...selectionRef.current, endX: coords.x, endY: coords.y };
      drawOverlay();
    }
  }, [getCanvasCoords, drawOverlay]);

  const handleMouseUp = useCallback(() => {
    const mode = toolModeRef.current;
    const scale = viewportScaleRef.current;
    const { w: canvasW, h: canvasH } = canvasSizeRef.current;
    const pageHeight = canvasH / scale;

    if ((mode === "draw" || mode === "eraser") && isDrawingRef.current) {
      isDrawingRef.current = false;
      const pts = drawPointsRef.current;
      drawPointsRef.current = [];
      drawOverlay();

      if (pts.length > 1) {
        const pagePoints = pts.map((p) => ({
          x: p.x / scale,
          y: pageHeight - p.y / scale,
        }));
        onAnnotationRef.current({
          type: mode,
          pageIndex: currentPageRef.current - 1,
          x: 0, y: 0, w: 0, h: 0,
          points: pagePoints,
        });
      }
      return;
    }

    const sel = selectionRef.current;
    selectionRef.current = null;
    drawOverlay();

    if (!sel) return;

    const selX = Math.min(sel.startX, sel.endX);
    const selY = Math.min(sel.startY, sel.endY);
    const selW = Math.abs(sel.endX - sel.startX);
    const selH = Math.abs(sel.endY - sel.startY);

    if (selW < 5 || selH < 5) return;

    const pageX = selX / scale;
    const pageY = pageHeight - (selY / scale) - (selH / scale);

    if (mode === "text") {
      const text = prompt("Enter text:");
      if (text) {
        onAnnotationRef.current({ type: "text", pageIndex: currentPageRef.current - 1, x: pageX, y: pageY, w: selW / scale, h: selH / scale, text });
      }
    } else {
      onAnnotationRef.current({ type: mode, pageIndex: currentPageRef.current - 1, x: pageX, y: pageY, w: selW / scale, h: selH / scale });
    }
  }, [drawOverlay]);

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

  const getCursor = () => {
    switch (toolMode) {
      case "pan": return "grab";
      case "select": return "default";
      default: return "crosshair";
    }
  };

  return (
    <div ref={containerRef} className="pdf-viewer" style={{ cursor: getCursor() }}>
      <div className="pdf-page-container" style={{ position: "relative" }}>
        <canvas ref={canvasRef} style={{ display: "block" }} />
        <canvas
          ref={overlayCanvasRef}
          style={{ position: "absolute", top: 0, left: 0, display: "block" }}
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onMouseLeave={() => {
            if (isDrawingRef.current) {
              isDrawingRef.current = false;
              drawPointsRef.current = [];
            }
            selectionRef.current = null;
            drawOverlay();
          }}
        />
        <div ref={textLayerRef} className="text-layer" />
      </div>
    </div>
  );
}
