import { defineStore } from "pinia";
import { ref, computed } from "vue";
import { useConfigStore } from "./config";
import { useProbeTestStore } from "./probeTest";
import { usePelicanTestStore } from "./pelicanTest";
import type { PelicanHistoryItem, ProbeHistoryItem } from "../types";

export const useAppStore = defineStore("app", () => {
  const configStore = useConfigStore();

  const activeMode = computed<"probe" | "pelican">({
    get: () => configStore.activeMode,
    set: (mode) => configStore.setActiveMode(mode),
  });

  const isHistoryModalOpen = ref(false);
  const isProbeCancelled = ref(false);
  const isPelicanCancelled = ref(false);

  const hasActiveResult = computed(() => {
    const probeStore = useProbeTestStore();
    const pelicanStore = usePelicanTestStore();
    return activeMode.value === "probe"
      ? probeStore.hasResult
      : pelicanStore.hasResult;
  });

  const totalHistoryCount = computed(() => {
    const probeStore = useProbeTestStore();
    const pelicanStore = usePelicanTestStore();
    return probeStore.probeHistoryList.length + pelicanStore.pelicanHistoryList.length;
  });

  const isCurrentRunning = computed(() => {
    const probeStore = useProbeTestStore();
    const pelicanStore = usePelicanTestStore();
    return activeMode.value === "probe"
      ? probeStore.isRunning
      : pelicanStore.isPelicanRunning;
  });

  const isOtherRunning = computed(() => {
    const probeStore = useProbeTestStore();
    const pelicanStore = usePelicanTestStore();
    return activeMode.value === "probe"
      ? pelicanStore.isPelicanRunning
      : probeStore.isRunning;
  });

  function setActiveMode(mode: "probe" | "pelican"): void {
    activeMode.value = mode;
  }

  function openHistoryModal(): void {
    isHistoryModalOpen.value = true;
  }

  function closeHistoryModal(): void {
    isHistoryModalOpen.value = false;
  }

  function handleStartTest(): void {
    const configStore = useConfigStore();
    const probeStore = useProbeTestStore();
    const pelicanStore = usePelicanTestStore();

    if (activeMode.value === "probe") {
      if (probeStore.isRunning) {
        isProbeCancelled.value = true;
        probeStore.cancelTest();
        return;
      }
      isProbeCancelled.value = false;
      const currentSavedName =
        configStore.matchedConfigItem?.name ||
        (configStore.isCurrentConfigSaved ? configStore.activeConfigName : undefined);
      probeStore.startTest(configStore.probeConfig, currentSavedName);
    } else {
      if (pelicanStore.isPelicanRunning) {
        isPelicanCancelled.value = true;
        pelicanStore.cancelPelicanTest();
        return;
      }
      isPelicanCancelled.value = false;
      const currentSavedName =
        configStore.matchedConfigItem?.name ||
        (configStore.isCurrentConfigSaved ? configStore.activeConfigName : undefined);
      pelicanStore.startPelicanTest(configStore.pelicanConfig, currentSavedName);
    }
  }

  function handleCancelTest(): void {
    const probeStore = useProbeTestStore();
    const pelicanStore = usePelicanTestStore();

    if (activeMode.value === "probe") {
      isProbeCancelled.value = true;
      probeStore.cancelTest();
    } else {
      isPelicanCancelled.value = true;
      pelicanStore.cancelPelicanTest();
    }
  }

  function applyPelicanHistory(item: PelicanHistoryItem): void {
    const pelicanStore = usePelicanTestStore();
    pelicanStore.applyHistoryItem(item);
    activeMode.value = "pelican";
    isHistoryModalOpen.value = false;
  }

  function applyProbeHistory(item: ProbeHistoryItem): void {
    const probeStore = useProbeTestStore();
    probeStore.applyHistoryItem(item);
    activeMode.value = "probe";
    isHistoryModalOpen.value = false;
  }

  return {
    activeMode,
    isHistoryModalOpen,
    isProbeCancelled,
    isPelicanCancelled,
    hasActiveResult,
    totalHistoryCount,
    isCurrentRunning,
    isOtherRunning,
    setActiveMode,
    openHistoryModal,
    closeHistoryModal,
    handleStartTest,
    handleCancelTest,
    applyPelicanHistory,
    applyProbeHistory,
  };
});
