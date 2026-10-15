import { createApp } from "vue";
import { createPinia } from "pinia";
import App from "./App.vue";
import { initTauri } from "./services/api";
import "./style.css";

async function bootstrap(): Promise<void> {
  // 初始化 Tauri API 上下文（若在桌面环境）
  await initTauri();

  // 创建并挂载 Vue 应用
  const app = createApp(App);
  const pinia = createPinia();
  app.use(pinia);
  app.mount("#app");
}

void bootstrap();
