import { getTauriInvoke, isTauriApp } from "./api";

/** 返回保存位置；用户取消另存为时返回 null。 */
export async function savePelicanFile(blob: Blob, fileName: string): Promise<string | null> {
  if (isTauriApp() && /Windows/i.test(navigator.userAgent)) {
    const invoke = getTauriInvoke();
    if (!invoke) throw new Error("桌面接口尚未初始化");
    const extension = fileName.split(".").at(-1) || "";
    const data = Array.from(new Uint8Array(await blob.arrayBuffer()));
    return invoke<string | null>("save_pelican_file", { fileName, extension, data });
  }

  // 浏览器预览沿用浏览器自身的下载策略。
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 30_000);
  return fileName;
}
