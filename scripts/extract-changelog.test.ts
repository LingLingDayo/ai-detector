import { describe, expect, it } from "vitest";
import { extractChangelog } from "./extract-changelog";

describe("extractChangelog", () => {
  const sampleChangelog = `# 更新日志 (Changelog)

本项目的所有显著变更都将记录在此文件中。
---

## [Unreleased]
- 正在开发的一些草稿特性
---

## [1.0.0] - 2026-10-12

### 🌟 Features
- feat: 提供双重检测模式，支持模型探针指纹比对与鹈鹕测试
- feat: 支持保存、更新与快速切换多个 API 端点配置预设

### ⚡ Perf & Refactor
- refactor: 模块化拆分通用弹窗组件

### 🔧 Fixes
- fix: 修复配置列表拖拽换位逻辑
---

## [0.2.0] - 2026-10-01

### 🌟 Features
- feat: 支持多中转站配置预设管理
---

## 0.1.0 (2026-09-20)

### 🌟 Features
- feat: 初始化项目工程与基础客户端框架

---

[1.0.0]: https://github.com/example/releases/tag/v1.0.0
[0.2.0]: https://github.com/example/releases/tag/v0.2.0
`;

  it("应该能准确通过带 v 前缀的 tag 提取版本日志", () => {
    const result = extractChangelog(sampleChangelog, "v1.0.0");
    expect(result).toMatch(/feat: 提供双重检测模式，支持模型探针指纹比对与鹈鹕测试/);
    expect(result).toMatch(/refactor: 模块化拆分通用弹窗组件/);
    expect(result).toMatch(/fix: 修复配置列表拖拽换位逻辑/);
    expect(result).not.toMatch(/## \[1\.0\.0\]/);
    expect(result).not.toMatch(/feat: 支持多中转站配置预设管理/);
    expect(result).not.toMatch(/https:\/\/github\.com/);
  });

  it("应该能兼容不带 v 前缀的纯版本号", () => {
    const result = extractChangelog(sampleChangelog, "1.0.0");
    expect(result).toMatch(/feat: 提供双重检测模式/);
    expect(result).not.toMatch(/feat: 支持多中转站配置预设管理/);
  });

  it("应该能支持 refs/tags/v* 格式的 Git 引用传参", () => {
    const result = extractChangelog(sampleChangelog, "refs/tags/v0.2.0");
    expect(result).toMatch(/feat: 支持多中转站配置预设管理/);
    expect(result).not.toMatch(/feat: 初始化项目工程/);
  });

  it("应该能支持非括号包裹的标题版本（如 0.1.0）", () => {
    const result = extractChangelog(sampleChangelog, "v0.1.0");
    expect(result).toMatch(/feat: 初始化项目工程与基础客户端框架/);
  });

  it("在未指定 tag 时应跳过 Unreleased 并自动选取第一个已发布版本", () => {
    const result = extractChangelog(sampleChangelog, "");
    expect(result).toMatch(/feat: 提供双重检测模式/);
    expect(result).not.toMatch(/正在开发的一些草稿特性/);
  });

  it("当指定了不存在的 tag 时应返回友好的提示说明而不是静默展示旧版本", () => {
    const result = extractChangelog(sampleChangelog, "v9.9.9");
    expect(result).toMatch(/9\.9\.9/);
    expect(result).toMatch(/CHANGELOG\.md 中暂未记录该版本的详细说明/);
    expect(result).not.toMatch(/feat: 提供双重检测模式/);
  });

  it("输入空或非法文本时应能安全降级返回", () => {
    expect(extractChangelog("", "v1.0.0")).toBe("No changelog content available.");
    expect(extractChangelog(null as unknown as string, "v1.0.0")).toBe(
      "No changelog content available."
    );
  });
});
