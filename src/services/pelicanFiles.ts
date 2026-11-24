import { getTauriInvoke, isTauriApp } from "./api";
import type { PelicanDownloadFormat, PelicanFileResult } from "./pelicanExportTypes";

export function buildPelicanFileName(modelName: string, format: PelicanDownloadFormat, createdAt = Date.now()): string {
  const model = (modelName || "model").replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 80);
  return `pelican-${model}-${createdAt}.${format}`;
}

export async function savePelicanFile(blob: Blob, fileName: string): Promise<PelicanFileResult> {
  if (isTauriApp()) {
    const invoke = getTauriInvoke();
    if (!invoke) throw new Error("桌面下载接口尚未就绪");
    const data = Array.from(new Uint8Array(await blob.arrayBuffer()));
    const path = await invoke<string>("save_pelican_download", { fileName, data });
    if (!path) throw new Error("未能获取实际保存路径");
    return { fileName, path };
  }

  // 浏览器只能接管下载，无法向网页提供真实落盘目录。
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  try {
    link.href = url;
    link.download = fileName;
    document.body.appendChild(link);
    link.click();
  } finally {
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 30_000);
  }
  return { fileName, path: null };
}
