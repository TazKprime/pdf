import { useState, useCallback, useRef, useEffect } from "react";
import {
  getPdfPageCount,
  getPdfMetadata,
  mergePdfs,
  rotatePage,
  removePage,
  extractPages,
  setPdfMetadata as updateMetadata,
  duplicatePage,
  PdfMetadata,
} from "./lib/pdfOperations";
import { PdfToolbar } from "./components/PdfToolbar";
import { PdfViewer } from "./components/PdfViewer";
import { Sidebar } from "./components/Sidebar";
import { WelcomeScreen } from "./components/WelcomeScreen";
import { BookmarksPanel } from "./components/BookmarksPanel";
import { MetadataPanel } from "./components/MetadataPanel";

let dialogModule: any = null;
let fsModule: any = null;
let coreModule: any = null;

async function loadTauriModules() {
  try {
    dialogModule = await import("@tauri-apps/plugin-dialog");
    fsModule = await import("@tauri-apps/plugin-fs");
    coreModule = await import("@tauri-apps/api/core");
  } catch (e) {
    console.warn("Tauri modules not available, running in browser mode:", e);
  }
}

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
  const [tauriReady, setTauriReady] = useState(false);
  const [debugMsg, setDebugMsg] = useState("initializing...");

  const logDebug = useCallback((msg: string) => {
    console.log(`[PDF-DEBUG] ${msg}`);
    setDebugMsg(msg);
  }, []);

  useEffect(() => {
    loadTauriModules().then(() => setTauriReady(true));
  }, []);

  const updatePdfData = useCallback(async (data: Uint8Array) => {
    logDebug(`updatePdfData: ${data.length} bytes`);
    setPdfData(data);
    setIsModified(true);
    const count = await getPdfPageCount(data);
    setPageCount(count);
    const meta = await getPdfMetadata(data);
    setPdfMeta(meta);
    logDebug(`updatePdfData done: ${count} pages, title="${meta.title}"`);
  }, [logDebug]);

  const loadPdfFromData = useCallback(async (data: Uint8Array, name: string) => {
    logDebug(`loadPdfFromData: name="${name}", ${data.length} bytes, first4=[${data[0]},${data[1]},${data[2]},${data[3]}]`);
    setPdfData(data);
    setFileName(name);
    const count = await getPdfPageCount(data);
    setPageCount(count);
    const meta = await getPdfMetadata(data);
    setPdfMeta(meta);
    setCurrentPage(1);
    setIsModified(false);
    logDebug(`loaded: ${count} pages`);
  }, [logDebug]);

  const loadPdf = useCallback(async (path: string) => {
    setIsLoading(true);
    logDebug(`loadPdf: path="${path}"`);
    try {
      let data: Uint8Array;
      if (coreModule) {
        logDebug("reading via Rust invoke...");
        const b64: string = await coreModule.invoke("read_file_as_base64", { filePath: path });
        logDebug(`got base64: ${b64.length} chars`);
        const binary = atob(b64);
        const bytes = new Uint8Array(binary.length);
        for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
        data = bytes;
        logDebug(`decoded: ${data.length} bytes`);
      } else if (fsModule) {
        data = await fsModule.readFile(path);
      } else {
        logDebug("no Tauri modules available");
        return;
      }
      const name = path.split(/[\\/]/).pop() || "Untitled.pdf";
      setFilePath(path);
      await loadPdfFromData(data, name);
    } catch (err) {
      logDebug(`ERROR: ${err}`);
      console.error("Failed to load PDF:", err);
    } finally {
      setIsLoading(false);
    }
  }, [loadPdfFromData, logDebug]);

  const handleOpen = useCallback(async () => {
    if (dialogModule) {
      const selected = await dialogModule.open({
        multiple: false,
        filters: [{ name: "PDF", extensions: ["pdf"] }],
      });
      if (selected && typeof selected === "string") {
        await loadPdf(selected);
      }
    } else {
      // Fallback: use file input
      const input = document.createElement("input");
      input.type = "file";
      input.accept = ".pdf";
      input.onchange = async (e) => {
        const file = (e.target as HTMLInputElement).files?.[0];
        if (file) {
          const buffer = await file.arrayBuffer();
          await loadPdfFromData(new Uint8Array(buffer), file.name);
        }
      };
      input.click();
    }
  }, [loadPdf, loadPdfFromData]);

  const handleSave = useCallback(async () => {
    if (!filePath || !pdfData || !fsModule) return;
    try {
      await fsModule.writeFile(filePath, pdfData);
      setIsModified(false);
    } catch (err) {
      console.error("Failed to save:", err);
    }
  }, [filePath, pdfData]);

  const handleSaveAs = useCallback(async () => {
    if (!pdfData) return;
    if (dialogModule) {
      const savePath = await dialogModule.save({
        filters: [{ name: "PDF", extensions: ["pdf"] }],
        defaultPath: fileName,
      });
      if (savePath && fsModule) {
        try {
          await fsModule.writeFile(savePath, pdfData);
          setFilePath(savePath);
          setFileName(savePath.split(/[\\/]/).pop() || "Untitled.pdf");
          setIsModified(false);
        } catch (err) {
          console.error("Failed to save as:", err);
        }
      }
    } else {
      // Fallback: download
      const blob = new Blob([pdfData as BlobPart], { type: "application/pdf" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = fileName || "document.pdf";
      a.click();
      URL.revokeObjectURL(url);
      setIsModified(false);
    }
  }, [pdfData, fileName, filePath]);

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
    try {
      const data = await removePage(pdfData, pageIndex);
      await updatePdfData(data);
      if (currentPage > pageCount) {
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
    if (dialogModule) {
      const selected = await dialogModule.open({
        multiple: true,
        filters: [{ name: "PDF", extensions: ["pdf"] }],
      });
      if (selected && selected.length > 0) {
        try {
          const allPaths = selected.map((s: any) => (typeof s === "string" ? s : s as string));
          const allData: Uint8Array[] = [];
          for (const p of allPaths) {
            allData.push(await fsModule.readFile(p));
          }
          const merged = await mergePdfs(allData);
          const savePath = await dialogModule.save({
            filters: [{ name: "PDF", extensions: ["pdf"] }],
            defaultPath: "merged.pdf",
          });
          if (savePath) {
            await fsModule.writeFile(savePath, merged);
            await loadPdf(savePath);
          }
        } catch (err) {
          console.error("Failed to merge:", err);
        }
      }
    }
  }, [loadPdf]);

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
  }) => {
    if (!pdfData) return;
    try {
      const ops = await import("./lib/pdfOperations");
      let data: Uint8Array;
      switch (ann.type) {
        case "redact":
          data = await ops.drawRedaction(pdfData, ann.pageIndex, ann.x, ann.y, ann.w, ann.h);
          break;
        case "highlight":
          data = await ops.drawHighlight(pdfData, ann.pageIndex, ann.x, ann.y, ann.w, ann.h);
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
          <div style={{
            background: "#11111b", color: "#6c7086", fontSize: 11,
            fontFamily: "monospace", padding: "2px 8px", borderBottom: "1px solid #45475a",
          }}>
            {debugMsg}
          </div>
          {pdfData ? (
            <PdfViewer
              pdfData={pdfData}
              currentPage={currentPage}
              zoom={zoom}
              toolMode={toolMode}
              pageCount={pageCount}
              onPageChange={setCurrentPage}
              onAnnotation={handleAnnotation}
              onStatus={logDebug}
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
              title="Rotate 90 CW"
              onClick={(e) => {
                e.stopPropagation();
                onRotate(i, 90);
              }}
            >
              ↻
            </button>
            <button
              title="Rotate 90 CCW"
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
