import type { PelicanContentType } from "../components/pelican/pelicanPreview";

export type PelicanDownloadFormat = PelicanContentType | "gif";

export interface PelicanExportSource {
  content: string;
  contentType: PelicanContentType;
  modelName: string;
  createdAt?: number;
  getPreviewElement?: () => HTMLElement | null;
}

export interface PelicanFileResult {
  fileName: string;
  path: string | null;
}
