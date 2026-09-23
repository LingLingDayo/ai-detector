import type { GlobalAnalysisResult } from "../utils/fingerprint";
import {
  btnStart,
  startSpinner,
  progressSection,
  progressTitle,
  progressStatusDesc,
  progressPercent,
  progressCountText,
  progressBarFill,
  statusAlert,
  resultSection,
  winnerName,
  winnerProb,
  familyName,
  familyProb,
  validSamples,
  diagnosticsBar,
  resultsTbody,
  bankBadge,
} from "./dom";

export function escapeHtml(str: string): string {
  return String(str).replace(/[&<>'"]/g, (c) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    "'": "&#39;",
    '"': "&quot;",
  })[c] || c);
}

export function percentFormat(val: number): string {
  return `${(val * 100).toFixed(1)}%`;
}

export function updateStepUI(
  index: number,
  state: "pending" | "working" | "done" | "error",
  text: string,
  stat = ""
): void {
  const stepEl = document.getElementById(`step-${index}`);
  if (!stepEl) return;
  stepEl.className = `probe-step ${state}`;
  const stateEl = stepEl.querySelector(".step-state");
  const statEl = stepEl.querySelector(".step-stat");
  if (stateEl) stateEl.textContent = text;
  if (statEl) statEl.textContent = stat;
}

export function setProgress(
  completedCount: number,
  totalCount = 3,
  message = ""
): void {
  const percent = Math.min(100, Math.round((completedCount / totalCount) * 100));
  progressBarFill.style.width = `${percent}%`;
  progressPercent.textContent = `${percent}%`;
  progressCountText.textContent = `完成 ${completedCount}/${totalCount} 题`;
  if (message) progressStatusDesc.textContent = message;
}

export function showStatusAlert(
  msg: string,
  type: "error" | "warning" = "error"
): void {
  statusAlert.className = `status-alert ${type}`;
  statusAlert.textContent = msg;
  statusAlert.classList.remove("hidden");
}

export function hideStatusAlert(): void {
  statusAlert.classList.add("hidden");
}

export function setTestLoadingState(loading: boolean): void {
  btnStart.disabled = loading;
  if (loading) {
    startSpinner.classList.remove("hidden");
  } else {
    startSpinner.classList.add("hidden");
  }
}

export function renderBankBadge(modelCount: number): void {
  if (bankBadge) {
    bankBadge.innerHTML = `<span class="badge-dot"></span> ${modelCount} 个模型已就绪`;
  }
}

export function renderResults(analysis: GlobalAnalysisResult): void {
  winnerName.textContent = analysis.prediction_name || analysis.prediction;
  winnerProb.textContent = `全局概率 ${percentFormat(analysis.probability)}`;
  familyName.textContent =
    analysis.family_prediction_name || analysis.family_prediction;
  familyProb.textContent = `家族综合 ${percentFormat(analysis.family_probability)}`;
  validSamples.textContent = `${analysis.used_outputs} / 3`;

  // Diagnostics Bar
  diagnosticsBar.innerHTML = analysis.diagnostics
    .map(
      (d) =>
        `<span class="diag-pill ${d.accepted ? "accepted" : "rejected"}" title="预期基准: 需至少 ${d.minimum_numbers} 个有效整数">
          挑战 ${d.index + 1}: ${d.parsed_numbers} 个数字 · ${d.accepted ? "计入" : "忽略"}
        </span>`
    )
    .join("");

  // Results Table Rows
  resultsTbody.innerHTML = analysis.results
    .map((item, idx) => {
      const isWinner = idx === 0;
      const probPercent = (item.probability * 100).toFixed(1);
      return `
        <tr class="${isWinner ? "winner-row" : ""}">
          <td><span class="rank-pill">${idx + 1}</span></td>
          <td>
            <strong>${escapeHtml(item.display_name)}</strong>
            ${isWinner ? '<span class="badge badge-success" style="margin-left:6px">最佳归因</span>' : ""}
          </td>
          <td><span class="family-tag">${escapeHtml(item.family_name)}</span></td>
          <td>
            <div class="prob-cell">
              <div class="prob-bar-track">
                <div class="prob-bar-fill" style="width: ${probPercent}%"></div>
              </div>
              <span class="prob-val">${probPercent}%</span>
            </div>
          </td>
          <td><span class="similarity-val">${percentFormat(item.profile_similarity)}</span></td>
        </tr>
      `;
    })
    .join("");

  resultSection.classList.remove("hidden");
  resultSection.scrollIntoView({ behavior: "smooth", block: "start" });
}
