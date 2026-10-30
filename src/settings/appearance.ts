import { Moon, Palette, Sun } from "@lucide/vue";
import type { SettingsPage } from "./types";

export const appearancePage: SettingsPage = {
  id: "appearance",
  label: "外观",
  icon: Palette,
  sections: [
    {
      id: "theme",
      title: "主题风格",
      description: "切换应用的明暗风格，修改后立即生效并自动保存。",
      fields: [
        {
          key: "theme",
          type: "segmented",
          label: "界面风格",
          description: "适用于整个应用界面",
          defaultValue: "dark",
          options: [
            { value: "dark", label: "暗色", icon: Moon, title: "使用暗色界面" },
            { value: "light", label: "亮色", icon: Sun, title: "使用亮色界面" },
          ],
        },
      ],
    },
  ],
};
