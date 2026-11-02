import { defineStore } from "pinia";
import { ref, computed } from "vue";
import { useConfigStore } from "./config";
import { useProbeTestStore } from "./probeTest";
import { usePelicanTestStore } from "./pelicanTest";
import { useCandyTestStore } from "./candyTest";
import { useConnectionTestStore } from "./connectionTest";
import type {
  ActiveTestMode,
  CandyHistoryItem,
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
  const isSettingsModalOpen = ref(false);
  const isProbeCancelled = ref(false);
  const isPelicanCancelled = ref(false);
  const isCandyCancelled = ref(false);

  const hasActiveResult = computed(() => {
    const probeStore = useProbeTestStore();
    const pelicanStore = usePelicanTestStore();
    const candyStore = useCandyTestStore();
    const connectionStore = useConnectionTestStore();
    if (activeMode.value === "probe") return probeStore.hasResult;
    if (activeMode.value === "pelican") return pelicanStore.hasResult;
    if (activeMode.value === "candy") return candyStore.hasResult;
    return connectionStore.hasMessages;
  });

  const totalHistoryCount = computed(() => {
    const probeStore = useProbeTestStore();
    const pelicanStore = usePelicanTestStore();
    const candyStore = useCandyTestStore();
    const connectionStore = useConnectionTestStore();
    return (
      probeStore.probeHistoryList.length +
      pelicanStore.pelicanHistoryList.length +
      candyStore.candyHistoryList.length +
      connectionStore.connectionHistoryList.length
    );
  });

  const isCurrentRunning = computed(() => {
    const probeStore = useProbeTestStore();
    const pelicanStore = usePelicanTestStore();
    const candyStore = useCandyTestStore();
    const connectionStore = useConnectionTestStore();
    if (activeMode.value === "probe") return probeStore.isRunning;
    if (activeMode.value === "pelican") return pelicanStore.isPelicanRunning;
    if (activeMode.value === "candy") return candyStore.isRunning;
    return connectionStore.isConnectionRunning;
  });

  const isOtherRunning = computed(() => {
    const probeStore = useProbeTestStore();
    const pelicanStore = usePelicanTestStore();
    const candyStore = useCandyTestStore();
    const connectionStore = useConnectionTestStore();
    const map: Record<ActiveTestMode, boolean> = {
      probe: probeStore.isRunning,
      pelican: pelicanStore.isPelicanRunning,
      candy: candyStore.isRunning,
      connection: connectionStore.isConnectionRunning,
    };
    return (Object.keys(map) as ActiveTestMode[]).some(
      (mode) => mode !== activeMode.value && map[mode]
    );
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

  function openSettingsModal(): void {
    isSettingsModalOpen.value = true;
  }

  function closeSettingsModal(): void {
    isSettingsModalOpen.value = false;
  }

  function handleStartTest(): void {
    const configStore = useConfigStore();
    const probeStore = useProbeTestStore();
    const pelicanStore = usePelicanTestStore();
    const candyStore = useCandyTestStore();

    if (activeMode.value === "connection") {
      useConnectionTestStore().requestComposerFocus();
      return;
    }

    const currentSavedName =
      configStore.matchedConfigItem?.name ||
      (configStore.isCurrentConfigSaved ? configStore.activeConfigName : undefined);

    if (activeMode.value === "probe") {
      if (probeStore.isRunning) {
        isProbeCancelled.value = true;
        probeStore.cancelTest();
        return;
      }
      isProbeCancelled.value = false;
      probeStore.startTest(configStore.probeConfig, currentSavedName);
    } else if (activeMode.value === "candy") {
      if (candyStore.isRunning) {
        isCandyCancelled.value = true;
        candyStore.cancelTest();
        return;
      }
      isCandyCancelled.value = false;
      candyStore.startTest(configStore.candyConfig, currentSavedName);
    } else {
      if (pelicanStore.isPelicanRunning) {
        isPelicanCancelled.value = true;
        pelicanStore.cancelPelicanTest();
        return;
      }
      isPelicanCancelled.value = false;
      pelicanStore.startPelicanTest(configStore.pelicanConfig, currentSavedName);
    }
  }

  function handleCancelTest(): void {
    const probeStore = useProbeTestStore();
    const pelicanStore = usePelicanTestStore();
    const candyStore = useCandyTestStore();
    const connectionStore = useConnectionTestStore();

    if (activeMode.value === "probe") {
      isProbeCancelled.value = true;
      probeStore.cancelTest();
    } else if (activeMode.value === "pelican") {
      isPelicanCancelled.value = true;
      pelicanStore.cancelPelicanTest();
    } else if (activeMode.value === "candy") {
      isCandyCancelled.value = true;
      candyStore.cancelTest();
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

  function applyCandyHistory(item: CandyHistoryItem): void {
    const candyStore = useCandyTestStore();
    candyStore.applyHistoryItem(item);
    activeMode.value = "candy";
    isHistoryModalOpen.value = false;
  }

  return {
    activeMode,
    isHistoryModalOpen,
    isSettingsModalOpen,
    historyActiveTab,
    isProbeCancelled,
    isPelicanCancelled,
    isCandyCancelled,
    hasActiveResult,
    totalHistoryCount,
    isCurrentRunning,
    isOtherRunning,
    setActiveMode,
    setHistoryActiveTab,
    openHistoryModal,
    closeHistoryModal,
    openSettingsModal,
    closeSettingsModal,
    handleStartTest,
    handleCancelTest,
    applyPelicanHistory,
    applyProbeHistory,
    applyCandyHistory,
  };
});
