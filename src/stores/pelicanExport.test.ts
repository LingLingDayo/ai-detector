import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createPinia, setActivePinia } from "pinia";
import { usePelicanExportStore } from "./pelicanExport";
import { useToastStore } from "./toast";

const { record, save } = vi.hoisted(() => ({ record: vi.fn(), save: vi.fn() }));
vi.mock("../services/pelicanGif", () => ({ recordPelicanGif: record }));
vi.mock("../services/pelicanFiles", () => ({ buildPelicanFileName: (model: string, format: string) => `${model}.${format}`, savePelicanFile: save }));
const source = { content: "<svg>中文</svg>", contentType: "svg" as const, modelName: "qa", getPreviewElement: () => ({}) as HTMLElement };

beforeEach(() => { setActivePinia(createPinia()); record.mockReset(); save.mockReset(); vi.useFakeTimers(); });
afterEach(() => vi.useRealTimers());

describe("一键下载任务", () => {
  it("SVG原文件保持原字节，成功提示实际路径", async () => {
    const store = usePelicanExportStore();
    save.mockResolvedValue({ fileName: "qa.svg", path: "C:\\Downloads\\qa.svg" });
    await store.exportFile(source, "svg");
    expect(await (save.mock.calls[0][0] as Blob).text()).toBe(source.content);
    expect(record).not.toHaveBeenCalled();
    expect(useToastStore().toastState).toMatchObject({ isOpen: true, title: "下载完成", filePath: "C:\\Downloads\\qa.svg" });
    expect(store.isExporting).toBe(false);
  });

  it("GIF一次点击静默生成后保存，不重复启动同一任务", async () => {
    let finish!: (blob: Blob) => void;
    record.mockReturnValue(new Promise<Blob>(resolve => { finish = resolve; }));
    save.mockResolvedValue({ fileName: "qa.gif", path: "C:\\Downloads\\qa.gif" });
    const store = usePelicanExportStore();
    const task = store.exportFile(source, "gif");
    expect(store.isExporting).toBe(true);
    await store.exportFile(source, "gif");
    expect(record).toHaveBeenCalledOnce();
    finish(new Blob(["GIF89a"], { type: "image/gif" }));
    await task;
    expect(save).toHaveBeenCalledOnce();
    expect(save.mock.calls[0][1]).toBe("qa.gif");
    expect(store.isExporting).toBe(false);
  });

  it("保存失败显示错误而不是下载完成，任务解锁", async () => {
    save.mockRejectedValue("保存文件失败: 磁盘已满");
    const store = usePelicanExportStore();
    await store.exportFile(source, "svg");
    expect(useToastStore().toastState).toMatchObject({ type: "error", title: "下载失败", message: "保存文件失败: 磁盘已满", filePath: "" });
    expect(store.isExporting).toBe(false);
  });

  it("浏览器回退不把文件名冒充实际落盘路径", async () => {
    save.mockResolvedValue({ fileName: "qa.svg", path: null });
    await usePelicanExportStore().exportFile(source, "svg");
    expect(useToastStore().toastState).toMatchObject({ title: "已交给浏览器下载", filePath: "" });
  });

  it("未提供预览DOM时仍可通过离屏渲染正常导出 GIF", async () => {
    record.mockResolvedValue(new Blob(["GIF89a"], { type: "image/gif" }));
    save.mockResolvedValue({ fileName: "qa.gif", path: "C:\\Downloads\\qa.gif" });
    await usePelicanExportStore().exportFile({ ...source, getPreviewElement: undefined }, "gif");
    expect(record).toHaveBeenCalledOnce();
    expect(save).toHaveBeenCalledOnce();
    expect(useToastStore().toastState).toMatchObject({ type: "success", title: "下载完成" });
  });
});
