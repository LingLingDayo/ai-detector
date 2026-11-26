import { Info } from "@lucide/vue";
import SettingsAboutPanel from "../components/settings/SettingsAboutPanel.vue";
import type { SettingsPage } from "./types";

export const aboutPage: SettingsPage = {
  id: "about",
  label: "关于",
  icon: Info,
  sections: [
    {
      id: "update",
      title: "更新",
      fields: [
        {
          key: "autoCheckUpdate",
          type: "toggle",
          label: "自动检查更新",
          description: "每天自动检查一次新版本",
          defaultValue: true,
        },
      ],
    },
  ],
  component: SettingsAboutPanel,
};
