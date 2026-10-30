import type { Component } from "vue";
import type { SegmentedOption } from "../components/common";

export type SettingsValue = string | number | boolean;

export interface SettingsContext {
  values: Record<string, SettingsValue>;
  setValue: (key: string, value: SettingsValue) => void;
}

interface SettingsFieldBase {
  key: string;
  label: string;
  description?: string;
  defaultValue: SettingsValue;
  /** 依据当前设置值决定是否展示（显隐联动） */
  visible?: (ctx: SettingsContext) => boolean;
  /** 依据当前设置值决定是否可编辑（禁用联动） */
  disabled?: (ctx: SettingsContext) => boolean;
  /** 值变更后的联动处理，可读取并改写其他设置项 */
  onChange?: (value: SettingsValue, ctx: SettingsContext) => void;
}

export interface SegmentedSettingsField extends SettingsFieldBase {
  type: "segmented";
  options: SegmentedOption[];
  defaultValue: string;
}

export type SettingsField = SegmentedSettingsField;

export interface SettingsSection {
  id: string;
  title?: string;
  description?: string;
  fields: SettingsField[];
}

export interface SettingsPage {
  id: string;
  label: string;
  icon: Component;
  sections: SettingsSection[];
}
