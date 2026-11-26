import type { SettingsPage } from "./types";
import { generalPage } from "./general";
import { appearancePage } from "./appearance";
import { dataPage } from "./data";
import { aboutPage } from "./about";

export const settingsPages: SettingsPage[] = [generalPage, appearancePage, dataPage, aboutPage];

export type {
  AppTheme,
  SettingsContext,
  SettingsField,
  SettingsPage,
  SettingsSection,
  SettingsValue,
} from "./types";
