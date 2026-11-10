# 开发者诊断指南（内部）

> 本文仅面向开发者。诊断能力属于内部调试能力，**界面上不提供任何可见入口**，也不要在面向用户的文案、README 或更新日志里提示快捷键与开发者工具。

---

## 打开方式

| 操作 | 作用 |
| --- | --- |
| `Ctrl+Shift+D` | 打开 / 关闭诊断中心（唯一入口，无按钮、无菜单项） |
| `Ctrl+Shift+I` 或 `F12` | 打开 WebView 开发者工具，正式包同样可用 |
| 诊断中心 →「打开开发者工具」 | 同上，走 `open_devtools` 命令 |
| `Esc` | 关闭诊断中心 |

快捷键注册在 `src/App.vue` 的全局 `keydown` 中；「打开开发者工具」按钮仅在 Tauri 桌面端显示。诊断中心提供级别筛选、关键字搜索、错误计数、清空与「复制全部」（走剪贴板）。

## 日志能看什么

- Rust 侧 `log::error!` / `warn!` 打点：probe / chat / models / candy 主链路的失败与降级分支，只记模型名、格式、状态码，不记 API Key 与鉴权头。
- 前端 `console`、`window.onerror`、`unhandledrejection`、Vue `errorHandler` 以及 Rust 的 panic 信息。
- 缓冲上限 500 条，超出后丢弃最早记录；**日志只存在内存中，退出应用即清空**。
- 复制出去的文本会先经脱敏（`sk-*`、Bearer、`apiKey` / `token` / `authorization` / `secret` 字段与 URL 参数）。

## 白屏 / 启动失败时

Vue 挂载失败意味着 `Ctrl+Shift+D` 也注册不上，此时按 `Ctrl+Shift+I` 打开 DevTools，在 Console 中查看：

```js
window.__AI_DETECTOR_EARLY_ERRORS__
```

`index.html` 的内联脚本会把挂载前的异常暂存到这个内存数组（最多 20 条），不弹窗、不落盘。应用正常启动后，`src/services/diagnostics.ts` 会把这些记录导入诊断缓冲，并卸载这段临时监听，避免同一错误被采集两次。

需要控制台窗口与更完整的 Rust 日志时：

```bash
npm run build:debug      # 调试版安装包，跳过 release 产物归档
npm run build:app        # 正式包（同样带 devtools feature）
```

对已安装的 exe，也可从终端设置 `RUST_LOG=debug`、`RUST_BACKTRACE=1` 后启动。

## 数据流与契约

```
Rust log::Log / panic hook  →  emit("diagnostics://log")  →  services/diagnostics.ts（环形缓冲 + 脱敏）
                                                          →  components/diagnostics/DiagnosticsModal.vue
前端 console / onerror / unhandledrejection / Vue errorHandler ─┘
```

- 事件名 `diagnostics://log`，payload：`timestamp_ms`、`level`、`target`、`message`。
- 命令 `open_devtools`（`src-tauri/src/commands/system.rs`）：取 `main` 窗口调用 `WebviewWindow::open_devtools()`。
- `src-tauri/Cargo.toml` 为 `tauri` 启用了 `devtools` feature；已用 `cargo check --release` 验证正式包中该 API 仍可用。
- `src-tauri/src/diagnostics.rs` 的 MemoryLogger 带 `thread_local` 防递归保护，panic hook 会把崩溃信息发往同一通道（会替换默认 stderr hook）。

## 改动前必读的约束

- **零文件**：不写任何日志文件，不注册 `tauri_plugin_log`（该依赖仍留在 `Cargo.toml`，只是停用注册，不要"顺手启用"），不使用 `std::fs` 写入或 `TargetKind::LogDir`。
- **不持久化**：不写 `localStorage` / `sessionStorage`，不提供"导出到文件"；外发只走剪贴板。
- **不暴露**：不为诊断能力新增按钮、菜单、设置项，也不在面向用户的文案里提示隐藏快捷键。
- **脱敏**：规则在 `services/diagnostics.ts` 的 `SECRET_PATTERNS`，新增日志字段或打点时同步检查。
- 若将来上架 macOS App Store，需把 `devtools` feature 改为构建期门控（私有 API 有拒审风险）。

## 验证命令

```bash
npm test                 # Vitest 全量单测
npx vue-tsc --noEmit     # 类型检查
npm run build            # 前端生产构建
cd src-tauri && cargo check && cargo check --release
```
