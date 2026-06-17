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

interface DrawPoint {
  x: number;
  y: number;
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
  const [selection, setSelection] = useState<SelectionRect | null>(null);
  const [drawPoints, setDrawPoints] = useState<DrawPoint[]>([]);
  const isDrawingRef = useRef(false);
  const pdfDocRef = useRef<pdfjsLib.PDFDocumentProxy | null>(null);
  const [canvasSize, setCanvasSize] = useState({ w: 0, h: 0 });

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
        const viewport = page.getViewport({ scale });
        canvas.width = viewport.width;
        canvas.height = viewport.height;
        setCanvasSize({ w: viewport.width, h: viewport.height });
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

    if (selection) {
      const x = Math.min(selection.startX, selection.endX);
      const y = Math.min(selection.startY, selection.endY);
      const w = Math.abs(selection.endX - selection.startX);
      const h = Math.abs(selection.endY - selection.startY);
      ctx.fillStyle = toolMode === "redact" ? "rgba(0,0,0,0.8)" : "rgba(255,235,59,0.35)";
      ctx.fillRect(x, y, w, h);
      ctx.strokeStyle = toolMode === "redact" ? "#000" : "#ffeb3b";
      ctx.lineWidth = 2;
      ctx.strokeRect(x, y, w, h);
    }

    if (drawPoints.length > 1) {
      ctx.beginPath();
      ctx.moveTo(drawPoints[0].x, drawPoints[0].y);
      for (let i = 1; i < drawPoints.length; i++) {
        ctx.lineTo(drawPoints[i].x, drawPoints[i].y);
      }
      ctx.strokeStyle = toolMode === "eraser" ? "#fff" : "#f38ba8";
      ctx.lineWidth = toolMode === "eraser" ? 20 : 3;
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      ctx.stroke();
    }
  }, [selection, drawPoints, toolMode]);

  useEffect(() => {
    drawOverlay();
  }, [drawOverlay]);

  useEffect(() => {
    const overlay = overlayCanvasRef.current;
    const canvas = canvasRef.current;
    if (overlay && canvas) {
      overlay.width = canvas.width;
      overlay.height = canvas.height;
    }
  }, [canvasSize]);

  const getCanvasCoords = useCallback((e: React.MouseEvent): { x: number; y: number } => {
    const canvas = canvasRef.current!;
    const rect = canvas.getBoundingClientRect();
    return {
      x: (e.clientX - rect.left) * (canvas.width / rect.width),
      y: (e.clientY - rect.top) * (canvas.height / rect.height),
    };
  }, []);

  const isDrawTool = toolMode === "draw" || toolMode === "eraser";
  const isAnnotateTool = toolMode === "highlight" || toolMode === "redact" || toolMode === "text";

  const handleCanvasMouseDown = useCallback(
    (e: React.MouseEvent) => {
      if (toolMode === "select" || toolMode === "pan") return;
      const coords = getCanvasCoords(e);

      if (isDrawTool) {
        isDrawingRef.current = true;
        setDrawPoints([coords]);
        return;
      }

      if (isAnnotateTool) {
        setSelection({ startX: coords.x, startY: coords.y, endX: coords.x, endY: coords.y });
      }
    },
    [toolMode, getCanvasCoords, isDrawTool, isAnnotateTool]
  );

  const handleCanvasMouseMove = useCallback(
    (e: React.MouseEvent) => {
      const coords = getCanvasCoords(e);

      if (isDrawTool && isDrawingRef.current) {
        setDrawPoints((prev) => [...prev, coords]);
        return;
      }

      if (selection) {
        setSelection((prev) => prev ? { ...prev, endX: coords.x, endY: coords.y } : null);
      }
    },
    [getCanvasCoords, isDrawTool, selection]
  );

  const handleCanvasMouseUp = useCallback(() => {
    if (isDrawTool && isDrawingRef.current && drawPoints.length > 1) {
      isDrawingRef.current = false;
      const scale = zoom * 1.5;
      const pageWidth = canvasSize.w / scale;
      const pageHeight = canvasSize.h / scale;

      const pagePoints = drawPoints.map((p) => ({
        x: p.x / scale,
        y: pageHeight - p.y / scale,
      }));

      onAnnotation({
        type: toolMode,
        pageIndex: currentPage - 1,
        x: 0, y: 0, w: 0, h: 0,
        points: pagePoints,
      });
      setDrawPoints([]);
      return;
    }

    isDrawingRef.current = false;

    if (!selection) return;
    const scale = zoom * 1.5;
    const pageWidth = canvasSize.w / scale;
    const pageHeight = canvasSize.h / scale;

    const selX = Math.min(selection.startX, selection.endX);
    const selY = Math.min(selection.startY, selection.endY);
    const selW = Math.abs(selection.endX - selection.startX);
    const selH = Math.abs(selection.endY - selection.startY);

    const pageX = selX / scale;
    const pageY = pageHeight - (selY / scale) - (selH / scale);

    if (selW > 5 && selH > 5) {
      if (toolMode === "text") {
        const text = prompt("Enter text:");
        if (text) {
          onAnnotation({ type: "text", pageIndex: currentPage - 1, x: pageX, y: pageY, w: selW, h: selH, text });
        }
      } else {
        onAnnotation({ type: toolMode, pageIndex: currentPage - 1, x: pageX, y: pageY, w: selW, h: selH });
      }
    }
    setSelection(null);
  }, [selection, toolMode, currentPage, onAnnotation, zoom, canvasSize, isDrawTool, drawPoints]);

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
        <canvas ref={canvasRef} />
        <canvas
          ref={overlayCanvasRef}
          style={{ position: "absolute", top: 0, left: 0, pointerEvents: "auto" }}
          onMouseDown={handleCanvasMouseDown}
          onMouseMove={handleCanvasMouseMove}
          onMouseUp={handleCanvasMouseUp}
          onMouseLeave={() => {
            if (isDrawTool && isDrawingRef.current) {
              isDrawingRef.current = false;
              setDrawPoints([]);
            }
            setSelection(null);
          }}
        />
        <div ref={textLayerRef} className="text-layer" />
      </div>
    </div>
  );
}
