import { useState } from "react";
import { PdfMetadata, setPdfMetadata } from "../lib/pdfOperations";

interface MetadataPanelProps {
  pdfMeta: PdfMetadata;
  pdfData: Uint8Array;
  onMetadataUpdated: (data: Uint8Array) => void;
}

export function MetadataPanel({ pdfMeta, pdfData, onMetadataUpdated }: MetadataPanelProps) {
  const [title, setTitle] = useState(pdfMeta.title || "");
  const [author, setAuthor] = useState(pdfMeta.author || "");
  const [subject, setSubject] = useState(pdfMeta.subject || "");
  const [saving, setSaving] = useState(false);

  const handleSaveMetadata = async () => {
    setSaving(true);
    try {
      const data = await setPdfMetadata(pdfData, {
        title,
        author,
        subject,
      });
      onMetadataUpdated(data);
    } catch (err) {
      console.error("Failed to save metadata:", err);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="metadata-panel">
      <div className="meta-section">
        <h4>Properties</h4>
        <label className="meta-field">
          <span>Title</span>
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Document title"
          />
        </label>
        <label className="meta-field">
          <span>Author</span>
          <input
            type="text"
            value={author}
            onChange={(e) => setAuthor(e.target.value)}
            placeholder="Author name"
          />
        </label>
        <label className="meta-field">
          <span>Subject</span>
          <input
            type="text"
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            placeholder="Subject"
          />
        </label>
        <button
          className="meta-btn"
          onClick={handleSaveMetadata}
          disabled={saving}
        >
          {saving ? "Saving..." : "Save Metadata"}
        </button>
      </div>

      {pdfMeta.creator && (
        <div className="meta-section">
          <h4>Original Info</h4>
          <div className="meta-row">
            <span className="meta-label">Creator:</span>
            <span>{pdfMeta.creator}</span>
          </div>
          {pdfMeta.producer && (
            <div className="meta-row">
              <span className="meta-label">Producer:</span>
              <span>{pdfMeta.producer}</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
