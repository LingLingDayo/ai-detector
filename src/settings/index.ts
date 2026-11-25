import type { SettingsPage } from "./types";
import { generalPage } from "./general";
import { appearancePage } from "./appearance";
import { dataPage } from "./data";

export const settingsPages: SettingsPage[] = [generalPage, appearancePage, dataPage];

export type {
  AppTheme,
  SettingsContext,
  SettingsField,
  SettingsPage,
  SettingsSection,
  SettingsValue,
} from "./types";
