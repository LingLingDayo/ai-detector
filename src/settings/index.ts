import type { SettingsPage } from "./types";
import { generalPage } from "./general";
import { appearancePage } from "./appearance";

export const settingsPages: SettingsPage[] = [generalPage, appearancePage];

export type {
  SettingsContext,
  SettingsField,
  SettingsPage,
  SettingsSection,
  SettingsValue,
} from "./types";
