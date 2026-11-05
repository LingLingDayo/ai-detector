import { Monitor, Moon, Palette, Sun } from "@lucide/vue";
import type { SettingsPage } from "./types";

export const appearancePage: SettingsPage = {
  id: "appearance",
  label: "外观",
  icon: Palette,
  sections: [
    {
      id: "theme",
      title: "主题风格",
      description: "选择界面配色方案，修改后立即生效并自动保存。",
      fields: [
        {
          key: "theme",
          type: "segmented",
          label: "界面风格",
          description: "适用于整个应用界面",
          defaultValue: "default",
          options: [
            { value: "default", label: "默认", icon: Monitor, title: "经典深蓝配色" },
            { value: "light", label: "亮色", icon: Sun, title: "浅色配色" },
            { value: "midnight", label: "暗色", icon: Moon, title: "中性灰阶暗色" },
          ],
        },
      ],
    },
  ],
};
