import { defineStore } from "pinia";
import { onScopeDispose, ref } from "vue";
import { recordPelicanGif } from "../services/pelicanGif";
import { buildPelicanFileName, savePelicanFile } from "../services/pelicanFiles";
import type { PelicanDownloadFormat, PelicanExportSource } from "../services/pelicanExportTypes";
import { useToastStore } from "./toast";

export const usePelicanExportStore = defineStore("pelicanExport", () => {
  const isExporting = ref(false);
  let controller: AbortController | undefined;
  const toastStore = useToastStore();

  async function exportFile(source: PelicanExportSource, format: PelicanDownloadFormat): Promise<void> {
    if (isExporting.value) return;
    isExporting.value = true;
    controller = new AbortController();
    try {
      if (!source.content.trim()) throw new Error("没有可下载的图形内容");
      if (format !== "gif" && format !== source.contentType) throw new Error("下载格式与原始内容不一致");
      let blob: Blob;
      if (format === "gif") {
        toastStore.hideToast();
        blob = await recordPelicanGif({
          content: source.content,
          contentType: source.contentType,
          bgTheme: source.bgTheme,
          previewElement: source.getPreviewElement?.() ?? null,
        }, { signal: controller.signal });
      } else {
        blob = new Blob([source.content], { type: format === "html" ? "text/html;charset=utf-8" : "image/svg+xml;charset=utf-8" });
      }
      const result = await savePelicanFile(blob, buildPelicanFileName(source.modelName, format, source.createdAt));
      if (result.path) {
        toastStore.showToast({ type: "success", title: "下载完成", filePath: result.path, duration: 5000 });
      } else {
        toastStore.showToast({ type: "info", title: "已交给浏览器下载", message: result.fileName, duration: 4000 });
      }
    } catch (error) {
      toastStore.showToast({ type: "error", title: "下载失败", message: error instanceof Error ? error.message : String(error), duration: 5000 });
    } finally {
      controller = undefined;
      isExporting.value = false;
    }
  }

  onScopeDispose(() => controller?.abort());
  return { isExporting, exportFile };
});
