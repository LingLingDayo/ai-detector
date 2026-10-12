import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { extractChangelog } from '../extract-changelog.js';

describe('extractChangelog', () => {
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

  it('应该能准确通过带 v 前缀的 tag 提取版本日志', () => {
    const result = extractChangelog(sampleChangelog, 'v1.0.0');
    assert.match(result, /feat: 提供双重检测模式，支持模型探针指纹比对与鹈鹕测试/);
    assert.match(result, /refactor: 模块化拆分通用弹窗组件/);
    assert.match(result, /fix: 修复配置列表拖拽换位逻辑/);
    assert.doesNotMatch(result, /## \[1\.0\.0\]/);
    assert.doesNotMatch(result, /feat: 支持多中转站配置预设管理/);
    assert.doesNotMatch(result, /https:\/\/github\.com/);
  });

  it('应该能兼容不带 v 前缀的纯版本号', () => {
    const result = extractChangelog(sampleChangelog, '1.0.0');
    assert.match(result, /feat: 提供双重检测模式/);
    assert.doesNotMatch(result, /feat: 支持多中转站配置预设管理/);
  });

  it('应该能支持 refs/tags/v* 格式的 Git 引用传参', () => {
    const result = extractChangelog(sampleChangelog, 'refs/tags/v0.2.0');
    assert.match(result, /feat: 支持多中转站配置预设管理/);
    assert.doesNotMatch(result, /feat: 初始化项目工程/);
  });

  it('应该能支持非括号包裹的标题版本（如 0.1.0）', () => {
    const result = extractChangelog(sampleChangelog, 'v0.1.0');
    assert.match(result, /feat: 初始化项目工程与基础客户端框架/);
  });

  it('在未指定 tag 时应跳过 Unreleased 并自动选取第一个已发布版本', () => {
    const result = extractChangelog(sampleChangelog, '');
    assert.match(result, /feat: 提供双重检测模式/);
    assert.doesNotMatch(result, /正在开发的一些草稿特性/);
  });

  it('当指定了不存在的 tag 时应返回友好的提示说明而不是静默展示旧版本', () => {
    const result = extractChangelog(sampleChangelog, 'v9.9.9');
    assert.match(result, /9\.9\.9/);
    assert.match(result, /CHANGELOG\.md 中暂未记录该版本的详细说明/);
    assert.doesNotMatch(result, /feat: 提供双重检测模式/);
  });

  it('输入空或非法文本时应能安全降级返回', () => {
    assert.equal(extractChangelog('', 'v1.0.0'), 'No changelog content available.');
    assert.equal(extractChangelog(null, 'v1.0.0'), 'No changelog content available.');
  });
});
