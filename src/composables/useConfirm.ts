import {
  useConfirmStore,
  type ConfirmType,
  type ConfirmStyleVariant,
  type ConfirmButtonVariant,
  type ConfirmOptions,
  type ConfirmModalState,
} from "../stores/confirm";

export type {
  ConfirmType,
  ConfirmStyleVariant,
  ConfirmButtonVariant,
  ConfirmOptions,
  ConfirmModalState,
};

export function useConfirm() {
  const confirmStore = useConfirmStore();

  return {
    confirmState: confirmStore.confirmState,
    confirm: confirmStore.confirm,
    handleConfirm: confirmStore.handleConfirm,
    handleCancel: confirmStore.handleCancel,
  };
}
