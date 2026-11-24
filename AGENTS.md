# AGENTS.md

## 目录与职责

| 路径 | 职责 |
| --- | --- |
| `src/App.vue` | 主界面编排、测试模式切换、全局快捷键与弹窗挂载 |
| `src/components/` | 按功能域分目录的 UI 组件（common / config-* / connection / history / settings / probe-detail / pelican / diagnostics 等） |
| `src/stores/` | Pinia 状态：配置、四类测试、app、settings、toast、confirm |
| `src/services/` | API 调用、流式 runner、指纹同步、诊断采集 |
| `src/composables/` | 复用逻辑（toast / confirm / clipboard） |
| `src/utils/`、`src/data/` | 纯函数工具、题库与预设数据 |
| `src/settings/`、`src/types.ts`、`src/constants.ts`、`src/style.css` | 设置项定义、类型与常量、主题 CSS 变量 |
| `src-tauri/src/commands/` | Rust 命令：probe / chat / models / candy / system |
| `src-tauri/src/diagnostics.rs`、`lib.rs` | 内存日志桥与 Tauri 入口 |
| `scripts/`、`docs/` | 构建发布脚本、开发者文档与图片 |

## 技术栈

- 前端使用 Vue 3 Composition API + `<script setup>` + TypeScript，构建用 Vite，桌面运行时用 Tauri 2 (Rust)。
- 组件样式必须写成 SCSS：`<style lang="scss" scoped>`；颜色与主题优先引用 `src/style.css` 的 CSS 变量，避免新增硬编码色值。
- 状态管理统一用 Pinia setup store（`src/stores/`）；跨组件、跨模块状态不得留在组件局部 `ref`。
- 单元测试用 Vitest，文件名 `*.test.ts` 且与被测源码同目录；测试运行在 node 环境，需要 `window` / DOM 时自行 stub。

## 项目约定

- 组件按功能域放进 `src/components/<功能域>/`，通用组件集中在 `src/components/common/`。
- 新增弹窗、表单控件或调用交互能力（如确认框、Toast 提示、剪贴板操作等）时，必须优先复用 `src/components/common/` 下的已有组件与 `src/composables/`、`src/stores/` 中的现成封装，并在布局、动效与视觉细节上与现有弹窗/组件风格保持一致，禁止使用原生 `alert` / `confirm` 或重复造轮子。
- 跨语言边界：前端用 `invoke` 调 Rust command，Rust 用 Emitter 发事件、前端用 `listen` 接收。

## 提交与验证

- 提交信息沿用仓库历史格式 `type(scope): 中文描述`。
- 前端改动后运行 `npm test`、`npx vue-tsc --noEmit`、`npm run build`；Rust 改动后追加 `cd src-tauri && cargo check`。
