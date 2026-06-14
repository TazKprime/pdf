interface BookmarkEntry {
  title: string;
  page: number;
}

interface BookmarksPanelProps {
  bookmarks: BookmarkEntry[];
  onPageClick: (page: number) => void;
}

export function BookmarksPanel({ bookmarks, onPageClick }: BookmarksPanelProps) {
  if (bookmarks.length === 0) {
    return (
      <div className="panel-empty">
        <p>No bookmarks found in this PDF.</p>
      </div>
    );
  }

  return (
    <div className="bookmarks-panel">
      {bookmarks.map((bm, i) => (
        <div
          key={i}
          className="bookmark-item"
          onClick={() => onPageClick(bm.page)}
        >
          <span className="bookmark-title">{bm.title}</span>
          <span className="bookmark-page">p.{bm.page}</span>
        </div>
      ))}
    </div>
  );
}
