import { PDFDocument, PDFPage, degrees, rgb } from "pdf-lib";

export interface PdfMetadata {
  title: string;
  author: string;
  subject: string;
  creator: string;
  producer: string;
}

export async function getPdfPageCount(data: Uint8Array): Promise<number> {
  const doc = await PDFDocument.load(data);
  return doc.getPageCount();
}

export async function getPdfMetadata(data: Uint8Array): Promise<PdfMetadata> {
  const doc = await PDFDocument.load(data);
  return {
    title: doc.getTitle() || "",
    author: doc.getAuthor() || "",
    subject: doc.getSubject() || "",
    creator: doc.getCreator() || "",
    producer: doc.getProducer() || "",
  };
}

export async function setPdfMetadata(
  data: Uint8Array,
  meta: Partial<PdfMetadata>
): Promise<Uint8Array> {
  const doc = await PDFDocument.load(data);
  if (meta.title !== undefined) doc.setTitle(meta.title);
  if (meta.author !== undefined) doc.setAuthor(meta.author);
  if (meta.subject !== undefined) doc.setSubject(meta.subject);
  return doc.save();
}

export async function mergePdfs(sources: Uint8Array[]): Promise<Uint8Array> {
  const merged = await PDFDocument.create();
  for (const src of sources) {
    const doc = await PDFDocument.load(src);
    const pages = await merged.copyPages(doc, doc.getPageIndices());
    pages.forEach((page) => merged.addPage(page));
  }
  return merged.save();
}

export async function rotatePage(
  data: Uint8Array,
  pageIndex: number,
  angle: number
): Promise<Uint8Array> {
  const doc = await PDFDocument.load(data);
  const page = doc.getPage(pageIndex);
  const currentRotation = page.getRotation().angle;
  page.setRotation(degrees(currentRotation + angle));
  return doc.save();
}

export async function removePage(
  data: Uint8Array,
  pageIndex: number
): Promise<Uint8Array> {
  const doc = await PDFDocument.load(data);
  doc.removePage(pageIndex);
  return doc.save();
}

export async function extractPages(
  data: Uint8Array,
  pageIndices: number[]
): Promise<Uint8Array> {
  const srcDoc = await PDFDocument.load(data);
  const newDoc = await PDFDocument.create();
  const pages = await newDoc.copyPages(
    srcDoc,
    pageIndices.map((i) => i - 1)
  );
  pages.forEach((page) => newDoc.addPage(page));
  return newDoc.save();
}

export async function duplicatePage(
  data: Uint8Array,
  pageIndex: number
): Promise<Uint8Array> {
  const doc = await PDFDocument.load(data);
  const [copied] = await doc.copyPages(doc, [pageIndex]);
  doc.insertPage(pageIndex + 1, copied);
  return doc.save();
}

export async function addBlankPage(
  data: Uint8Array,
  width: number,
  height: number,
  afterPageIndex?: number
): Promise<Uint8Array> {
  const doc = await PDFDocument.load(data);
  const page = doc.addPage([width, height]);
  if (afterPageIndex !== undefined) {
    const pages = doc.getPages();
    const idx = pages.indexOf(page);
    if (idx > afterPageIndex + 1) {
      pages.splice(idx, 1);
      pages.splice(afterPageIndex + 1, 0, page);
    }
  }
  return doc.save();
}

export async function addTextAnnotation(
  data: Uint8Array,
  pageIndex: number,
  x: number,
  y: number,
  text: string,
  color: [number, number, number] = [1, 1, 0]
): Promise<Uint8Array> {
  const doc = await PDFDocument.load(data);
  const page = doc.getPage(pageIndex);
  page.drawText(text, {
    x,
    y,
    size: 12,
    color: rgb(color[0], color[1], color[2]),
  });
  return doc.save();
}

export async function drawHighlight(
  data: Uint8Array,
  pageIndex: number,
  x: number,
  y: number,
  w: number,
  h: number,
  color: [number, number, number] = [1, 0.93, 0.24]
): Promise<Uint8Array> {
  const doc = await PDFDocument.load(data);
  const page = doc.getPage(pageIndex);
  page.drawRectangle({
    x,
    y,
    width: w,
    height: h,
    color: rgb(color[0], color[1], color[2]),
    opacity: 0.4,
  });
  return doc.save();
}

export async function drawRedaction(
  data: Uint8Array,
  pageIndex: number,
  x: number,
  y: number,
  w: number,
  h: number
): Promise<Uint8Array> {
  const doc = await PDFDocument.load(data);
  const page = doc.getPage(pageIndex);
  page.drawRectangle({
    x,
    y,
    width: w,
    height: h,
    color: rgb(0, 0, 0),
    opacity: 1.0,
  });
  return doc.save();
}

export async function drawLine(
  data: Uint8Array,
  pageIndex: number,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  thickness: number = 2,
  color: [number, number, number] = [0, 0, 0]
): Promise<Uint8Array> {
  const doc = await PDFDocument.load(data);
  const page = doc.getPage(pageIndex);
  page.drawLine({
    start: { x: x1, y: y1 },
    end: { x: x2, y: y2 },
    thickness,
    color: rgb(color[0], color[1], color[2]),
  });
  return doc.save();
}

export async function addPassword(
  data: Uint8Array,
  userPassword: string,
  ownerPassword?: string
): Promise<Uint8Array> {
  const doc = await PDFDocument.load(data);
  return doc.save({
    useObjectStreams: true,
    addDefaultPage: false,
  });
}

export async function getBookmarks(_data: Uint8Array): Promise<{ title: string; page: number }[]> {
  return [];
}
