import { describe, expect, it } from "vitest";
import { parseReleaseNotes } from "./releaseNotes";

describe("parseReleaseNotes", () => {
  it("解析包含 emoji 分组和 commit 前缀的更新日志", () => {
    const input = `✨ Features\r\nfeat: 新增设置数据管理页\r\nfeat(settings): 支持记住密钥\r\n\r\n🔧 Fixes\r\nfix: 修复连接测试异常\r\n---\r\n[1.3.0]: https://example.com`;

    expect(parseReleaseNotes(input)).toEqual([
      {
        title: "✨ Features",
        items: ["新增设置数据管理页", "支持记住密钥"],
      },
      {
        title: "🔧 Fixes",
        items: ["修复连接测试异常"],
      },
    ]);
  });

  it("支持 Markdown 标题、列表项、斜体提示并丢弃空分组", () => {
    const input = `### 更新亮点\n\n- 支持便携版自动更新\n* 新增关于页面\n\n### 空分组\n\n*暂无更多说明*`;
    expect(parseReleaseNotes(input)).toEqual([
      {
        title: "更新亮点",
        items: ["支持便携版自动更新", "新增关于页面"],
      },
      {
        title: "空分组",
        items: ["暂无更多说明"],
      },
    ]);
  });

  it("无标题时放入默认空标题分组", () => {
    expect(parseReleaseNotes("- 第一条更新\nfeat: 第二条更新")).toEqual([
      {
        title: "",
        items: ["第一条更新", "第二条更新"],
      },
    ]);
  });
});
