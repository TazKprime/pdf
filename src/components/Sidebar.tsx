import { ReactNode } from "react";

interface SidebarProps {
  activeTab: "pages" | "bookmarks" | "metadata";
  onTabChange: (tab: "pages" | "bookmarks" | "metadata") => void;
  currentPage: number;
  pageCount: number;
  onPageSelect: (p: number) => void;
  children: ReactNode;
}

export function Sidebar({
  activeTab,
  onTabChange,
  currentPage,
  pageCount,
  onPageSelect,
  children,
}: SidebarProps) {
  return (
    <div className="sidebar">
      <div className="sidebar-tabs">
        <button
          className={`sidebar-tab ${activeTab === "pages" ? "active" : ""}`}
          onClick={() => onTabChange("pages")}
        >
          Pages
        </button>
        <button
          className={`sidebar-tab ${activeTab === "bookmarks" ? "active" : ""}`}
          onClick={() => onTabChange("bookmarks")}
        >
          Bookmarks
        </button>
        <button
          className={`sidebar-tab ${activeTab === "metadata" ? "active" : ""}`}
          onClick={() => onTabChange("metadata")}
        >
          Info
        </button>
      </div>
      <div className="sidebar-content">{children}</div>
    </div>
  );
}
