import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createPinia, setActivePinia } from "pinia";
import { buildPelicanFileName, pickDownloadDirectory, savePelicanFile } from "./pelicanFiles";
import { useSettingsStore } from "../stores";

const { invoke, desktop } = vi.hoisted(() => ({ invoke: vi.fn(), desktop: { value: true } }));
vi.mock("./api", () => ({ isTauriApp: () => desktop.value, getTauriInvoke: () => invoke }));

beforeEach(() => {
  setActivePinia(createPinia());
  invoke.mockReset();
  desktop.value = true;
  vi.useFakeTimers();
});
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });

describe("鹈鹕下载文件", () => {
  it("下载文件名沿用模型与时间戳，排除路径符号", () => {
    expect(buildPelicanFileName("model/test:1", "gif", 123)).toBe("pelican-model_test_1-123.gif");
    expect(buildPelicanFileName("", "html", 123)).toBe("pelican-model-123.html");
  });

  it("原生保存完成才返回真实下载路径与完整UTF8字节", async () => {
    const path = "C:\\Users\\测试\\Downloads\\图形 (1).svg";
    invoke.mockResolvedValue(path);
    const blob = new Blob(["<svg>中文</svg>"]);
    expect(await savePelicanFile(blob, "图形.svg")).toEqual({ fileName: "图形.svg", path });
    expect(invoke).toHaveBeenCalledWith("save_pelican_download", {
      fileName: "图形.svg", data: Array.from(new TextEncoder().encode("<svg>中文</svg>")),
    });
  });

  it("配置自定义下载目录时一并传给原生保存命令", async () => {
    const store = useSettingsStore();
    store.setValue("downloadDirectory", "  D:\\Exports\\pelican  ");
    invoke.mockResolvedValue("D:\\Exports\\pelican\\图形.svg");
    const blob = new Blob(["<svg></svg>"]);

    expect(await savePelicanFile(blob, "图形.svg")).toEqual({
      fileName: "图形.svg",
      path: "D:\\Exports\\pelican\\图形.svg",
    });
    expect(invoke).toHaveBeenCalledWith("save_pelican_download", {
      fileName: "图形.svg",
      data: Array.from(new TextEncoder().encode("<svg></svg>")),
      downloadDir: "D:\\Exports\\pelican",
    });
  });

  it("写入失败不冒充成功路径", async () => {
    invoke.mockRejectedValue("磁盘空间不足");
    await expect(savePelicanFile(new Blob(["GIF"]), "test.gif")).rejects.toBe("磁盘空间不足");
  });

  it("浏览器回退明确未知实际路径，延迟回收下载URL", async () => {
    desktop.value = false;
    const link = { href: "", download: "", click: vi.fn(), remove: vi.fn() };
    const createObjectURL = vi.fn(() => "blob:qa");
    const revokeObjectURL = vi.fn();
    vi.stubGlobal("URL", { createObjectURL, revokeObjectURL });
    vi.stubGlobal("document", { createElement: () => link, body: { appendChild: vi.fn() } });
    expect(await savePelicanFile(new Blob(["<html></html>"]), "page.html")).toEqual({ fileName: "page.html", path: null });
    expect(link.download).toBe("page.html");
    expect(link.click).toHaveBeenCalledOnce();
    expect(invoke).not.toHaveBeenCalled();
    vi.advanceTimersByTime(29_999);
    expect(revokeObjectURL).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(revokeObjectURL).toHaveBeenCalledWith("blob:qa");
  });

  it("桌面端唤起文件夹选择器并返回所选目录，取消时返回 null", async () => {
    invoke.mockResolvedValueOnce("D:\\Exports\\pelican");
    expect(await pickDownloadDirectory("C:\\Old")).toBe("D:\\Exports\\pelican");
    expect(invoke).toHaveBeenCalledWith("pick_download_directory", { currentDir: "C:\\Old" });

    invoke.mockResolvedValueOnce(null);
    expect(await pickDownloadDirectory()).toBeNull();
    expect(invoke).toHaveBeenLastCalledWith("pick_download_directory", {});

    desktop.value = false;
    await expect(pickDownloadDirectory()).rejects.toThrow("仅桌面应用支持选择本地文件夹");
  });
});
