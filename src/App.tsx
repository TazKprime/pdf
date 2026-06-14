import { useState, useCallback, useRef, useEffect } from "react";
import { open, save } from "@tauri-apps/plugin-dialog";
import { readFile, writeFile } from "@tauri-apps/plugin-fs";
import { invoke } from "@tauri-apps/api/core";
import {
  getPdfPageCount,
  getPdfMetadata,
  mergePdfs,
  rotatePage,
  removePage,
  extractPages,
  setPdfMetadata as updateMetadata,
  addPassword,
  duplicatePage,
  addBlankPage,
  drawRedaction,
  drawHighlight,
  drawLine,
  PdfMetadata,
} from "./lib/pdfOperations";
import { PdfToolbar } from "./components/PdfToolbar";
import { PdfViewer } from "./components/PdfViewer";
import { Sidebar } from "./components/Sidebar";
import { WelcomeScreen } from "./components/WelcomeScreen";
import { BookmarksPanel } from "./components/BookmarksPanel";
import { MetadataPanel } from "./components/MetadataPanel";

export interface PageData {
  index: number;
  width: number;
  height: number;
}

export type ToolMode = "select" | "pan" | "highlight" | "text" | "draw" | "redact" | "eraser";

function App() {
  const [filePath, setFilePath] = useState<string | null>(null);
  const [fileName, setFileName] = useState<string>("");
  const [pdfData, setPdfData] = useState<Uint8Array | null>(null);
  const [pdfMeta, setPdfMeta] = useState<PdfMetadata | null>(null);
  const [pageCount, setPageCount] = useState(0);
  const [currentPage, setCurrentPage] = useState(1);
  const [zoom, setZoom] = useState(1.0);
  const [toolMode, setToolMode] = useState<ToolMode>("select");
  const [sidebarTab, setSidebarTab] = useState<"pages" | "bookmarks" | "metadata">("pages");
  const [isLoading, setIsLoading] = useState(false);
  const [isModified, setIsModified] = useState(false);
  const [showSidebar, setShowSidebar] = useState(true);
  const [bookmarks, setBookmarks] = useState<{ title: string; page: number }[]>([]);

  const updatePdfData = useCallback(async (data: Uint8Array) => {
    setPdfData(data);
    setIsModified(true);
    const count = await getPdfPageCount(data);
    setPageCount(count);
    const meta = await getPdfMetadata(data);
    setPdfMeta(meta);
  }, []);

  const loadPdf = useCallback(async (path: string) => {
    setIsLoading(true);
    try {
      const data = await readFile(path);
      setPdfData(data);
      setFilePath(path);
      setFileName(path.split(/[\\/]/).pop() || "Untitled.pdf");

      const count = await getPdfPageCount(data);
      setPageCount(count);

      const meta = await getPdfMetadata(data);
      setPdfMeta(meta);

      setCurrentPage(1);
      setIsModified(false);
    } catch (err) {
      console.error("Failed to load PDF:", err);
      alert(`Failed to load PDF: ${err}`);
    } finally {
      setIsLoading(false);
    }
  }, []);

  const handleOpen = useCallback(async () => {
    const selected = await open({
      multiple: false,
      filters: [{ name: "PDF", extensions: ["pdf"] }],
    });
    if (selected && typeof selected === "string") {
      await loadPdf(selected);
    }
  }, [loadPdf]);

  const handleSave = useCallback(async () => {
    if (!filePath || !pdfData) return;
    try {
      await writeFile(filePath, pdfData);
      setIsModified(false);
    } catch (err) {
      console.error("Failed to save:", err);
    }
  }, [filePath, pdfData]);

  const handleSaveAs = useCallback(async () => {
    if (!pdfData) return;
    const savePath = await save({
      filters: [{ name: "PDF", extensions: ["pdf"] }],
      defaultPath: fileName,
    });
    if (savePath) {
      try {
        await writeFile(savePath, pdfData);
        setFilePath(savePath);
        setFileName(savePath.split(/[\\/]/).pop() || "Untitled.pdf");
        setIsModified(false);
      } catch (err) {
        console.error("Failed to save as:", err);
      }
    }
  }, [pdfData, fileName]);

  const handleRotatePage = useCallback(async (pageIndex: number, degrees: number) => {
    if (!pdfData) return;
    try {
      const data = await rotatePage(pdfData, pageIndex, degrees);
      await updatePdfData(data);
    } catch (err) {
      console.error("Failed to rotate:", err);
    }
  }, [pdfData, updatePdfData]);

  const handleRemovePage = useCallback(async (pageIndex: number) => {
    if (!pdfData) return;
    if (!confirm(`Remove page ${pageIndex + 1}?`)) return;
    try {
      const data = await removePage(pdfData, pageIndex);
      await updatePdfData(data);
      if (currentPage > data.length) {
        setCurrentPage(Math.max(1, pageCount - 1));
      }
    } catch (err) {
      console.error("Failed to remove page:", err);
    }
  }, [pdfData, currentPage, pageCount, updatePdfData]);

  const handleDuplicatePage = useCallback(async (pageIndex: number) => {
    if (!pdfData) return;
    try {
      const data = await duplicatePage(pdfData, pageIndex);
      await updatePdfData(data);
    } catch (err) {
      console.error("Failed to duplicate:", err);
    }
  }, [pdfData, updatePdfData]);

  const handleMerge = useCallback(async () => {
    const selected = await open({
      multiple: true,
      filters: [{ name: "PDF", extensions: ["pdf"] }],
    });
    if (selected && selected.length > 0) {
      try {
        const allPaths = selected.map((s) => (typeof s === "string" ? s : s as string));
        const allData: Uint8Array[] = [];
        for (const p of allPaths) {
          allData.push(await readFile(p));
        }
        const merged = await mergePdfs(allData);
        const savePath = await save({
          filters: [{ name: "PDF", extensions: ["pdf"] }],
          defaultPath: "merged.pdf",
        });
        if (savePath) {
          await writeFile(savePath, merged);
          await loadPdf(savePath);
        }
      } catch (err) {
        console.error("Failed to merge:", err);
      }
    }
  }, [loadPdf]);

  const handleExtractPages = useCallback(async (pageNumbers: number[]) => {
    if (!pdfData) return;
    const savePath = await save({
      filters: [{ name: "PDF", extensions: ["pdf"] }],
      defaultPath: "extracted.pdf",
    });
    if (savePath) {
      try {
        const data = await extractPages(pdfData, pageNumbers);
        await writeFile(savePath, data);
        await loadPdf(savePath);
      } catch (err) {
        console.error("Failed to extract:", err);
      }
    }
  }, [pdfData, loadPdf]);

  const handleZoomIn = useCallback(() => setZoom((z) => Math.min(z + 0.25, 5.0)), []);
  const handleZoomOut = useCallback(() => setZoom((z) => Math.max(z - 0.25, 0.25)), []);
  const handleZoomReset = useCallback(() => setZoom(1.0), []);

  const handleAnnotation = useCallback(async (ann: {
    type: string;
    pageIndex: number;
    x: number;
    y: number;
    w: number;
    h: number;
    text?: string;
  }) => {
    if (!pdfData) return;
    try {
      let data: Uint8Array;
      switch (ann.type) {
        case "redact":
          data = await drawRedaction(pdfData, ann.pageIndex, ann.x, ann.y, ann.w, ann.h);
          break;
        case "highlight":
          data = await drawHighlight(pdfData, ann.pageIndex, ann.x, ann.y, ann.w, ann.h);
          break;
        case "text":
          data = await drawLine(pdfData, ann.pageIndex, ann.x, ann.y, ann.x + ann.w, ann.y + ann.h);
          break;
        default:
          return;
      }
      await updatePdfData(data);
    } catch (err) {
      console.error("Failed to add annotation:", err);
    }
  }, [pdfData, updatePdfData]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "o") {
        e.preventDefault();
        handleOpen();
      }
      if ((e.metaKey || e.ctrlKey) && e.key === "s") {
        e.preventDefault();
        if (e.shiftKey) handleSaveAs();
        else handleSave();
      }
      if ((e.metaKey || e.ctrlKey) && e.key === "=") {
        e.preventDefault();
        handleZoomIn();
      }
      if ((e.metaKey || e.ctrlKey) && e.key === "-") {
        e.preventDefault();
        handleZoomOut();
      }
      if ((e.metaKey || e.ctrlKey) && e.key === "0") {
        e.preventDefault();
        handleZoomReset();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [handleOpen, handleSave, handleSaveAs, handleZoomIn, handleZoomOut, handleZoomReset]);

  return (
    <div className="app">
      <PdfToolbar
        fileName={fileName}
        isModified={isModified}
        toolMode={toolMode}
        zoom={zoom}
        currentPage={currentPage}
        totalPages={pageCount}
        showSidebar={showSidebar}
        onOpen={handleOpen}
        onSave={handleSave}
        onSaveAs={handleSaveAs}
        onMerge={handleMerge}
        onToolChange={setToolMode}
        onZoomIn={handleZoomIn}
        onZoomOut={handleZoomOut}
        onZoomReset={handleZoomReset}
        onToggleSidebar={() => setShowSidebar((s) => !s)}
      />
      <div className="app-body">
        {showSidebar && pdfData && (
          <Sidebar
            activeTab={sidebarTab}
            onTabChange={setSidebarTab}
            currentPage={currentPage}
            pageCount={pageCount}
            onPageSelect={setCurrentPage}
          >
            {sidebarTab === "pages" && (
              <PagesPanel
                pageCount={pageCount}
                currentPage={currentPage}
                onPageSelect={setCurrentPage}
                onRotate={(p, d) => handleRotatePage(p, d)}
                onRemove={handleRemovePage}
                onDuplicate={handleDuplicatePage}
              />
            )}
            {sidebarTab === "bookmarks" && (
              <BookmarksPanel
                bookmarks={bookmarks}
                onPageClick={(p) => setCurrentPage(p)}
              />
            )}
            {sidebarTab === "metadata" && pdfMeta && (
              <MetadataPanel
                pdfMeta={pdfMeta}
                pdfData={pdfData}
                onMetadataUpdated={(data) => updatePdfData(data)}
              />
            )}
          </Sidebar>
        )}
        <div className="viewer-container">
          {pdfData ? (
            <PdfViewer
              pdfData={pdfData}
              currentPage={currentPage}
              zoom={zoom}
              toolMode={toolMode}
              pageCount={pageCount}
              onPageChange={setCurrentPage}
              onAnnotation={handleAnnotation}
            />
          ) : (
            <WelcomeScreen onOpen={handleOpen} />
          )}
        </div>
      </div>
    </div>
  );
}

function PagesPanel({
  pageCount,
  currentPage,
  onPageSelect,
  onRotate,
  onRemove,
  onDuplicate,
}: {
  pageCount: number;
  currentPage: number;
  onPageSelect: (p: number) => void;
  onRotate: (pageIndex: number, degrees: number) => void;
  onRemove: (pageIndex: number) => void;
  onDuplicate: (pageIndex: number) => void;
}) {
  return (
    <div className="pages-panel">
      {Array.from({ length: pageCount }, (_, i) => (
        <div
          key={i}
          className={`page-thumb ${currentPage === i + 1 ? "active" : ""}`}
          onClick={() => onPageSelect(i + 1)}
        >
          <div className="page-thumb-content">
            <span className="page-number">Page {i + 1}</span>
          </div>
          <div className="page-thumb-actions">
            <button
              title="Duplicate"
              onClick={(e) => {
                e.stopPropagation();
                onDuplicate(i);
              }}
            >
              +
            </button>
            <button
              title="Rotate 90° CW"
              onClick={(e) => {
                e.stopPropagation();
                onRotate(i, 90);
              }}
            >
              ↻
            </button>
            <button
              title="Rotate 90° CCW"
              onClick={(e) => {
                e.stopPropagation();
                onRotate(i, 270);
              }}
            >
              ↺
            </button>
            <button
              title="Remove page"
              onClick={(e) => {
                e.stopPropagation();
                onRemove(i);
              }}
            >
              ✕
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}

export default App;
