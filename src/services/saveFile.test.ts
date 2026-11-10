import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const { invoke } = vi.hoisted(() => ({ invoke: vi.fn() }));
vi.mock("./api", () => ({ isTauriApp: () => true, getTauriInvoke: () => invoke }));
import { savePelicanFile } from "./saveFile";

beforeEach(() => {
  invoke.mockReset();
  vi.stubGlobal("navigator", { userAgent: "Windows NT 10.0" });
});
afterEach(() => vi.unstubAllGlobals());

describe("鹈鹕文件另存为", () => {
  it.each(["gif", "svg", "html"])("将 %s 文件交给原生另存为，保留文件名和全部字节", async extension => {
    const bytes = new Uint8Array([0, 255, 127, 10]);
    invoke.mockResolvedValue("D:\\作品\\自定义." + extension);
    const fileName = `pelican-test.${extension}`;
    await expect(savePelicanFile(new Blob([bytes]), fileName)).resolves.toBe("D:\\作品\\自定义." + extension);
    expect(invoke).toHaveBeenCalledWith("save_pelican_file", {
      fileName, extension, data: [0, 255, 127, 10],
    });
  });

  it("取消时返回 null，不触发浏览器下载", async () => {
    invoke.mockResolvedValue(null);
    await expect(savePelicanFile(new Blob(["test"]), "pelican.svg")).resolves.toBeNull();
    expect(invoke).toHaveBeenCalledTimes(1);
  });

  it("写入失败时保留错误供界面显示", async () => {
    invoke.mockRejectedValue(new Error("保存文件失败: 拒绝访问"));
    await expect(savePelicanFile(new Blob(["test"]), "pelican.svg")).rejects.toThrow("拒绝访问");
  });
});
