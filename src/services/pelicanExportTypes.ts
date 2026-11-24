import type { PelicanContentType } from "../components/pelican/pelicanPreview";

export type PelicanDownloadFormat = PelicanContentType | "gif";

export interface PelicanExportSource {
  content: string;
  contentType: PelicanContentType;
  modelName: string;
  bgTheme?: "dark" | "light";
  createdAt?: number;
  getPreviewElement?: () => HTMLElement | null;
}

export interface PelicanFileResult {
  fileName: string;
  path: string | null;
}
