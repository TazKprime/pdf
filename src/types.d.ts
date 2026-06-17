declare module "pdfjs-dist/build/pdf.worker.min.mjs?url" {
  const url: string;
  export default url;
}

declare module "pdfjs-dist/build/pdf.worker.min.mjs" {
  const workerSrc: string;
  export default workerSrc;
}

interface ImportMeta {
  readonly env: Record<string, string>;
}
