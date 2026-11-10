import { createApp } from "vue";
import { createPinia } from "pinia";
import App from "./App.vue";
import { initTauri } from "./services/api";
import { handleVueError, installDiagnostics } from "./services/diagnostics";
import "./style.css";

async function bootstrap(): Promise<void> {
  // 先安装全局采集，确保 Vue 挂载前后的异常都能进入内存诊断缓冲
  installDiagnostics();

  // 初始化 Tauri API 上下文（若在桌面环境）
  await initTauri();

  // 创建并挂载 Vue 应用
  const app = createApp(App);
  const pinia = createPinia();
  app.config.errorHandler = (err, _instance, info) => handleVueError(err, info);
  app.use(pinia);
  app.mount("#app");
}

void bootstrap();
