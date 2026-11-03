import type { Component } from "vue";
import type { SegmentedOption, SelectOption } from "../components/common";

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

export interface ToggleSettingsField extends SettingsFieldBase {
  type: "toggle";
  defaultValue: boolean;
}

export interface NumberSettingsField extends SettingsFieldBase {
  type: "number";
  defaultValue: number;
  min?: number;
  max?: number;
  step?: number;
  /** 展示在输入框右侧的单位文案，如“秒” */
  unit?: string;
  placeholder?: string;
}

export interface SelectSettingsField extends SettingsFieldBase {
  type: "select";
  options: SelectOption[];
  defaultValue: string;
  placeholder?: string;
}

export type SettingsField =
  | SegmentedSettingsField
  | ToggleSettingsField
  | NumberSettingsField
  | SelectSettingsField;

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
