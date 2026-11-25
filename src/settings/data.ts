import { Database } from "@lucide/vue";
import SettingsDataPanel from "../components/settings/SettingsDataPanel.vue";
import type { SettingsPage } from "./types";

export const dataPage: SettingsPage = {
  id: "data",
  label: "数据",
  icon: Database,
  sections: [],
  component: SettingsDataPanel,
};
