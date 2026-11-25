import type { Component } from "vue";
import type { SegmentedOption, SelectOption } from "../components/common";

export type SettingsValue = string | number | boolean;

/** 界面风格：经典深蓝、亮色、中性灰阶暗色 */
export type AppTheme = "default" | "light" | "midnight";

export interface SettingsContext {
  values: Record<string, SettingsValue>;
  setValue: (key: string, value: SettingsValue) => void;
}

interface SettingsFieldBase {
  key: string;
  label: string;
  description?: string | ((ctx: SettingsContext) => string);
  /** 描述文案是否限制单行显示并在超出时省略（悬停展示完整内容） */
  descriptionSingleLine?: boolean;
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

export interface TextSettingsField extends SettingsFieldBase {
  type: "text";
  defaultValue: string;
  placeholder?: string;
  maxLength?: number;
  monospace?: boolean;
  /** 控件是否独占下一行（用于较长的文本输入框） */
  stacked?: boolean;
}

export interface DirectorySettingsField extends SettingsFieldBase {
  type: "directory";
  defaultValue: string;
  placeholder?: string;
}

export type SettingsField =
  | SegmentedSettingsField
  | ToggleSettingsField
  | NumberSettingsField
  | SelectSettingsField
  | TextSettingsField
  | DirectorySettingsField;

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
  /** 自定义整页组件（如「数据」导入导出页），存在时替代常规 sections 渲染 */
  component?: Component;
}
