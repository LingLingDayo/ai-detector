import { defineStore } from "pinia";
import { ref, computed } from "vue";
import { useConfigStore } from "./config";
import { useProbeTestStore } from "./probeTest";
import { usePelicanTestStore } from "./pelicanTest";
import { useConnectionTestStore } from "./connectionTest";
import type {
  ActiveTestMode,
  HistoryTab,
  PelicanHistoryItem,
  ProbeHistoryItem,
} from "../types";

export const useAppStore = defineStore("app", () => {
  const configStore = useConfigStore();

  const activeMode = computed<ActiveTestMode>({
    get: () => configStore.activeMode,
    set: (mode) => configStore.setActiveMode(mode),
  });

  const isHistoryModalOpen = ref(false);
  const isProbeCancelled = ref(false);
  const isPelicanCancelled = ref(false);

  const hasActiveResult = computed(() => {
    const probeStore = useProbeTestStore();
    const pelicanStore = usePelicanTestStore();
    const connectionStore = useConnectionTestStore();
    if (activeMode.value === "probe") return probeStore.hasResult;
    if (activeMode.value === "pelican") return pelicanStore.hasResult;
    return connectionStore.hasMessages;
  });

  const totalHistoryCount = computed(() => {
    const probeStore = useProbeTestStore();
    const pelicanStore = usePelicanTestStore();
    const connectionStore = useConnectionTestStore();
    return (
      probeStore.probeHistoryList.length +
      pelicanStore.pelicanHistoryList.length +
      connectionStore.connectionHistoryList.length
    );
  });

  const isCurrentRunning = computed(() => {
    const probeStore = useProbeTestStore();
    const pelicanStore = usePelicanTestStore();
    const connectionStore = useConnectionTestStore();
    if (activeMode.value === "probe") return probeStore.isRunning;
    if (activeMode.value === "pelican") return pelicanStore.isPelicanRunning;
    return connectionStore.isConnectionRunning;
  });

  const isOtherRunning = computed(() => {
    const probeStore = useProbeTestStore();
    const pelicanStore = usePelicanTestStore();
    const connectionStore = useConnectionTestStore();
    if (activeMode.value === "probe") {
      return pelicanStore.isPelicanRunning || connectionStore.isConnectionRunning;
    }
    if (activeMode.value === "pelican") {
      return probeStore.isRunning || connectionStore.isConnectionRunning;
    }
    return probeStore.isRunning || pelicanStore.isPelicanRunning;
  });

  const historyActiveTab = ref<HistoryTab>("probe");

  function setActiveMode(mode: ActiveTestMode): void {
    activeMode.value = mode;
  }

  function setHistoryActiveTab(tab: HistoryTab): void {
    historyActiveTab.value = tab;
  }

  function openHistoryModal(tab?: HistoryTab): void {
    historyActiveTab.value = tab || activeMode.value;
    isHistoryModalOpen.value = true;
  }

  function closeHistoryModal(): void {
    isHistoryModalOpen.value = false;
  }

  function handleStartTest(): void {
    const configStore = useConfigStore();
    const probeStore = useProbeTestStore();
    const pelicanStore = usePelicanTestStore();

    if (activeMode.value === "connection") {
      useConnectionTestStore().requestComposerFocus();
      return;
    }

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
    const connectionStore = useConnectionTestStore();

    if (activeMode.value === "probe") {
      isProbeCancelled.value = true;
      probeStore.cancelTest();
    } else if (activeMode.value === "pelican") {
      isPelicanCancelled.value = true;
      pelicanStore.cancelPelicanTest();
    } else if (connectionStore.isConnectionRunning) {
      connectionStore.stopConnectionReply();
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
    historyActiveTab,
    isProbeCancelled,
    isPelicanCancelled,
    hasActiveResult,
    totalHistoryCount,
    isCurrentRunning,
    isOtherRunning,
    setActiveMode,
    setHistoryActiveTab,
    openHistoryModal,
    closeHistoryModal,
    handleStartTest,
    handleCancelTest,
    applyPelicanHistory,
    applyProbeHistory,
  };
});
