# AGENTS.md

AI Detector：Tauri 2 (Rust) + Vue 3 桌面应用，用于鉴别大模型 API 背后的真实模型。面向中文用户。

## 基本模块

| 路径 | 方向 |
| --- | --- |
| `src/App.vue` | 主界面编排、测试模式切换、全局快捷键与弹窗挂载 |
| `src/components/` | 按功能分目录的 UI 组件（common / config-* / connection / history / settings / probe-detail / pelican / diagnostics 等） |
| `src/stores/` | Pinia 状态：配置、四类测试、app、settings、toast、confirm |
| `src/services/` | API 调用、流式 runner、指纹同步、诊断采集 |
| `src/composables/` | 复用逻辑（toast / confirm / clipboard） |
| `src/utils/`、`src/data/` | 纯函数工具、题库与预设数据 |
| `src/settings/`、`src/types.ts`、`src/constants.ts`、`src/style.css` | 设置项定义、类型与常量、主题 CSS 变量 |
| `src-tauri/src/commands/` | Rust 命令：probe / chat / models / candy / system |
| `src-tauri/src/diagnostics.rs`、`lib.rs` | 内存日志桥与 Tauri 入口 |
| `scripts/`、`docs/` | 构建发布脚本、开发者文档与图片 |

## 方向性约束

- 前端用 Vue 3 Composition API + `<script setup>` + TypeScript，构建走 Vite，桌面层走 Tauri 2。
- 样式用 Sass/SCSS（`<style lang="scss" scoped>`）；颜色与主题统一走 `src/style.css` 的 CSS 变量，不硬编码。
- 状态管理用 Pinia setup store，跨组件、跨模块状态不留在组件局部 `ref`。
- 前后端边界：前端 `invoke` 调 Rust command，Rust 用 Emitter / `listen` 传事件；错误信息用中文。
- 优先复用 `src/components/common/` 与 `src/composables/`；组件名 PascalCase，变量/函数 camelCase，常量 UPPER_SNAKE_CASE。
- 测试用 Vitest，`*.test.ts` 与源码同目录；node 环境下需要 `window` 时自行 stub。
- 诊断日志纯内存、不落盘、不写本地存储；开发者能力不在 UI 暴露可见入口，见 `docs/diagnostics.md`。
- 不擅自新增依赖，需先确认；界面文案、错误信息、注释用中文，注释只解释"为什么"。
- 提交格式 `type(scope): 中文描述`，关键节点分步提交。通用工程规范另见 `.qoder/rules/main.md`。
