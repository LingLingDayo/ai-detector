import { defineStore } from "pinia";
import { reactive, ref } from "vue";

export type ConfirmType = "warning" | "danger" | "info" | "success";
export type ConfirmStyleVariant = "spotlight" | "banner" | "detail" | "minimal";
export type ConfirmButtonVariant = "primary" | "warning" | "danger" | "success" | "ghost";

export interface ConfirmOptions {
  /** 弹窗标题 */
  title?: string;
  /** 弹窗提示正文 */
  message?: string;
  /** 语义主题类型：warning 警告 | danger 危险 | info 信息 | success 成功 */
  type?: ConfirmType;
  /** 布局与视觉风格：spotlight 聚光灯居中 | banner 顶栏横幅 | detail 细则列表框 | minimal 极简紧凑 */
  styleVariant?: ConfirmStyleVariant;
  /** 确认按钮文案 */
  confirmText?: string;
  /** 取消按钮文案 */
  cancelText?: string;
  /** 确认按钮颜色风格，默认根据 type 自动选择 */
  confirmButtonVariant?: ConfirmButtonVariant;
  /** 取消按钮颜色风格，默认 ghost */
  cancelButtonVariant?: ConfirmButtonVariant;
  /** 高亮目标标签文本（如配置名称、项目名等） */
  highlightTag?: string;
  /** 影响事项或细则列表（在 detail 风格或提示中显示） */
  detailList?: string[];
  /** 是否显示取消按钮，默认 true */
  showCancel?: boolean;
  /** 点击遮罩背景是否关闭（返回 false），默认 true */
  closeOnBackdrop?: boolean;
  /** 按 ESC 键是否关闭（返回 false），默认 true */
  closeOnEsc?: boolean;
}

export interface ConfirmModalState extends ConfirmOptions {
  isOpen: boolean;
  loading: boolean;
}

const defaultState: ConfirmModalState = {
  isOpen: false,
  loading: false,
  title: "",
  message: "",
  type: "warning",
  styleVariant: "spotlight",
  confirmText: "确定",
  cancelText: "取消",
  confirmButtonVariant: undefined,
  cancelButtonVariant: "ghost",
  highlightTag: "",
  detailList: [],
  showCancel: true,
  closeOnBackdrop: true,
  closeOnEsc: true,
};

export const useConfirmStore = defineStore("confirm", () => {
  const state = reactive<ConfirmModalState>({ ...defaultState });
  let currentResolve: ((value: boolean) => void) | null = null;

  function confirm(options: ConfirmOptions = {}): Promise<boolean> {
    if (currentResolve) {
      currentResolve(false);
      currentResolve = null;
    }

    return new Promise((resolve) => {
      currentResolve = resolve;

      state.type = options.type ?? "warning";
      state.styleVariant = options.styleVariant ?? "spotlight";
      state.title =
        options.title ??
        (options.type === "danger"
          ? "危险操作确认"
          : options.type === "warning"
          ? "提示与确认"
          : options.type === "success"
          ? "操作确认"
          : "信息确认");
      state.message = options.message ?? "";
      state.confirmText = options.confirmText ?? "确定";
      state.cancelText = options.cancelText ?? "取消";
      state.confirmButtonVariant = options.confirmButtonVariant;
      state.cancelButtonVariant = options.cancelButtonVariant ?? "ghost";
      state.highlightTag = options.highlightTag ?? "";
      state.detailList = options.detailList ?? [];
      state.showCancel = options.showCancel !== false;
      state.closeOnBackdrop = options.closeOnBackdrop !== false;
      state.closeOnEsc = options.closeOnEsc !== false;
      state.loading = false;
      state.isOpen = true;
    });
  }

  function handleConfirm(): void {
    if (currentResolve) {
      currentResolve(true);
      currentResolve = null;
    }
    state.isOpen = false;
  }

  function handleCancel(): void {
    if (currentResolve) {
      currentResolve(false);
      currentResolve = null;
    }
    state.isOpen = false;
  }

  function resetState(): void {
    if (currentResolve) {
      currentResolve(false);
      currentResolve = null;
    }
    Object.assign(state, defaultState);
  }

  return {
    confirmState: state,
    confirm,
    handleConfirm,
    handleCancel,
    resetState,
  };
});
