/**
 * budget.js — Monthly Budget Tracking & Threshold Alert Logic
 *
 * Pure budget calculations are independent of storage and UI,
 * evaluating monthly utilization, remaining allowance, and 80%/100% alerts.
 */

import { getBudgetForMonth, getTransactions, saveBudget } from './storage.js';
import {
  escapeHtml,
  formatCurrency,
  formatMonthLabel,
  getCategoryColor,
  getMonthKey,
} from './transactions.js';

/**
 * Pure budget calculation engine.
 * @param {Array<object>} transactions
 * @param {number} budgetAmount
 * @param {string} activeMonth
 */
export function computeBudgetStatus(transactions, budgetAmount, activeMonth) {
  const monthlyExpensesList = transactions.filter(
    (tx) => tx.type === 'expense' && getMonthKey(tx.date) === activeMonth
  );

  const monthlySpent = monthlyExpensesList.reduce((sum, tx) => sum + tx.amount, 0);
  const limit = Number(budgetAmount) || 0;
  const remainingBudget = limit - monthlySpent;

  const rawPercent = limit > 0 ? (monthlySpent / limit) * 100 : 0;
  const clampedPercent = Math.min(100, Math.max(0, rawPercent));

  let status = 'unset';
  if (limit > 0) {
    if (rawPercent > 100) {
      status = 'exceeded';
    } else if (rawPercent >= 80) {
      status = 'warning';
    } else {
      status = 'normal';
    }
  }

  // Daily safe spend across days left in active month
  const [yStr, mStr] = (activeMonth || '2026-11').split('-');
  const year = Number(yStr) || new Date().getFullYear();
  const month = Number(mStr) || new Date().getMonth() + 1;
  const daysInMonth = new Date(year, month, 0).getDate();

  const today = new Date();
  const currentMonthKey = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}`;
  let remainingDays = daysInMonth;
  if (activeMonth === currentMonthKey) {
    remainingDays = Math.max(1, daysInMonth - today.getDate() + 1);
  }
  const dailyAllowance =
    limit > 0 && remainingBudget > 0 ? remainingBudget / remainingDays : 0;

  // Group category drivers for active month
  const driverMap = new Map();
  for (const tx of monthlyExpensesList) {
    driverMap.set(tx.category, (driverMap.get(tx.category) || 0) + tx.amount);
  }

  const drivers = Array.from(driverMap.entries())
    .map(([category, amount]) => ({
      category,
      amount,
      shareOfBudget: limit > 0 ? (amount / limit) * 100 : 0,
      color: getCategoryColor(category),
    }))
    .sort((a, b) => b.amount - a.amount);

  return {
    budgetAmount: limit,
    monthlySpent,
    remainingBudget,
    rawPercent,
    clampedPercent,
    status,
    dailyAllowance,
    drivers,
  };
}

/**
 * Initializes the Budget Management form and returns the render controller.
 * @param {{ getActiveMonth: () => string, onDataChanged: (opts: object) => void }} appContext
 */
export function initBudgetModule(appContext) {
  const budgetForm = document.getElementById('budget-form');
  const budgetInput = document.getElementById('budget-amount-input');
  const budgetError = document.getElementById('budget-amount-error');
  const applyDefaultCheckbox = document.getElementById('budget-apply-default');

  if (budgetForm) {
    budgetForm.addEventListener('submit', (event) => {
      event.preventDefault();
      const rawVal = budgetInput ? budgetInput.value.trim() : '';
      const numericVal = Number(rawVal);

      if (!rawVal || !Number.isFinite(numericVal) || numericVal <= 0) {
        if (budgetError) {
          budgetError.textContent = 'Please enter a valid monthly budget greater than $0.00.';
        }
        if (budgetInput) budgetInput.classList.add('is-invalid');
        return;
      }

      if (numericVal > 100000000) {
        if (budgetError) {
          budgetError.textContent = 'Budget amount exceeds the maximum allowed limit.';
        }
        if (budgetInput) budgetInput.classList.add('is-invalid');
        return;
      }

      if (budgetError) budgetError.textContent = '';
      if (budgetInput) budgetInput.classList.remove('is-invalid');

      const activeMonth = appContext.getActiveMonth();
      const applyDefault = applyDefaultCheckbox ? applyDefaultCheckbox.checked : true;
      saveBudget(activeMonth, numericVal, applyDefault);

      appContext.onDataChanged({
        message: `Monthly budget for ${formatMonthLabel(activeMonth)} set to ${formatCurrency(numericVal)}.`,
      });
    });
  }

  function renderBudget(activeMonth) {
    const transactions = getTransactions();
    const currentBudget = getBudgetForMonth(activeMonth);
    const statusData = computeBudgetStatus(transactions, currentBudget, activeMonth);
    const monthLabel = formatMonthLabel(activeMonth);

    // Populate form input if not actively focused by the user
    if (budgetInput && document.activeElement !== budgetInput) {
      budgetInput.value = currentBudget > 0 ? String(currentBudget) : '';
    }

    const periodSub = document.getElementById('budget-period-subtitle');
    const formMonthLabel = document.getElementById('budget-form-month-label');
    if (periodSub) {
      periodSub.textContent = `Configure your ${monthLabel} spending cap and monitor real-time utilization`;
    }
    if (formMonthLabel) {
      formMonthLabel.textContent = `Target for ${monthLabel}`;
    }

    // Progress Bar & Utilization Readout
    const utilLabel = document.getElementById('budget-utilization-label');
    const progressContainer = document.getElementById('budget-progress-bar-container');
    const progressFill = document.getElementById('budget-progress-fill');

    if (utilLabel) {
      utilLabel.textContent =
        statusData.budgetAmount > 0 ? `${statusData.rawPercent.toFixed(1)}%` : '—';
      utilLabel.className = `utilization-readout tabular-nums ${
        statusData.status === 'exceeded'
          ? 'text-expense'
          : statusData.status === 'warning'
            ? 'text-warning'
            : ''
      }`;
    }

    if (progressContainer) {
      progressContainer.setAttribute('aria-valuenow', String(Math.round(statusData.rawPercent)));
    }

    if (progressFill) {
      progressFill.style.width = `${statusData.clampedPercent}%`;
      progressFill.className = 'progress-fill';
      if (statusData.status === 'exceeded') {
        progressFill.classList.add('is-danger');
      } else if (statusData.status === 'warning') {
        progressFill.classList.add('is-warning');
      } else if (statusData.status === 'normal') {
        progressFill.classList.add('is-normal');
      }
    }

    // Metrics
    const limitEl = document.getElementById('budget-metric-limit');
    const spentEl = document.getElementById('budget-metric-spent');
    const remainingLabelEl = document.getElementById('budget-metric-remaining-label');
    const remainingEl = document.getElementById('budget-metric-remaining');
    const dailyEl = document.getElementById('budget-metric-daily');

    if (limitEl) {
      limitEl.textContent =
        statusData.budgetAmount > 0 ? formatCurrency(statusData.budgetAmount) : 'Not set';
    }
    if (spentEl) {
      spentEl.textContent = formatCurrency(statusData.monthlySpent);
    }

    if (remainingLabelEl && remainingEl) {
      if (statusData.budgetAmount <= 0) {
        remainingLabelEl.textContent = 'Remaining Budget';
        remainingEl.textContent = '—';
        remainingEl.className = 'budget-metric-value tabular-nums';
      } else if (statusData.remainingBudget < 0) {
        remainingLabelEl.textContent = 'Over Budget By';
        remainingEl.textContent = formatCurrency(Math.abs(statusData.remainingBudget));
        remainingEl.className = 'budget-metric-value tabular-nums text-expense';
      } else {
        remainingLabelEl.textContent = 'Remaining Budget';
        remainingEl.textContent = formatCurrency(statusData.remainingBudget);
        remainingEl.className = 'budget-metric-value tabular-nums text-income';
      }
    }

    if (dailyEl) {
      dailyEl.textContent =
        statusData.budgetAmount > 0 ? formatCurrency(statusData.dailyAllowance) : '—';
    }

    // Callout Banner inside Budget View
    renderBudgetCallout(statusData, monthLabel);

    // Global Top Alert Banner (shown across all views on 80% warning or exceeded)
    renderGlobalBudgetAlert(statusData, monthLabel);

    // Category Drivers Table
    const driversTbody = document.getElementById('budget-drivers-tbody');
    const driversEmpty = document.getElementById('budget-drivers-empty');

    if (driversTbody) {
      driversTbody.innerHTML = statusData.drivers
        .map(
          (item) => `
          <tr>
            <td>
              <span class="legend-left">
                <span class="legend-swatch" style="background-color: ${escapeHtml(item.color)}"></span>
                <span class="tx-title">${escapeHtml(item.category)}</span>
              </span>
            </td>
            <td class="text-right tabular-nums tx-amount">${escapeHtml(formatCurrency(item.amount))}</td>
            <td class="text-right tabular-nums">
              ${statusData.budgetAmount > 0 ? `${item.shareOfBudget.toFixed(1)}%` : '—'}
            </td>
          </tr>
        `
        )
        .join('');
    }

    if (driversEmpty) {
      driversEmpty.classList.toggle('is-hidden', statusData.drivers.length > 0);
    }

    if (window.lucide) {
      window.lucide.createIcons();
    }
  }

  return { renderBudget };
}

/**
 * Updates the detailed Budget Status Callout on the Budget view.
 * @param {object} statusData
 * @param {string} monthLabel
 */
function renderBudgetCallout(statusData, monthLabel) {
  const callout = document.getElementById('budget-status-alert');
  const iconEl = document.getElementById('budget-status-icon');
  const titleEl = document.getElementById('budget-status-title');
  const descEl = document.getElementById('budget-status-desc');
  if (!callout || !titleEl || !descEl || !iconEl) return;

  callout.className = 'budget-callout';

  if (statusData.status === 'unset') {
    callout.classList.add('is-hidden');
    return;
  }

  if (statusData.status === 'exceeded') {
    callout.classList.add('is-danger');
    iconEl.setAttribute('data-lucide', 'alert-octagon');
    titleEl.textContent = `Monthly Budget Exceeded (${statusData.rawPercent.toFixed(1)}%)`;
    descEl.textContent = `Spending in ${monthLabel} has exceeded your ${formatCurrency(
      statusData.budgetAmount
    )} limit by ${formatCurrency(Math.abs(statusData.remainingBudget))}.`;
  } else if (statusData.status === 'warning') {
    callout.classList.add('is-warning');
    iconEl.setAttribute('data-lucide', 'alert-triangle');
    titleEl.textContent = `Approaching Budget Limit (${statusData.rawPercent.toFixed(1)}%)`;
    descEl.textContent = `You have reached ${statusData.rawPercent.toFixed(
      1
    )}% of your ${monthLabel} budget. ${formatCurrency(
      statusData.remainingBudget
    )} remains before exceeding your cap.`;
  } else {
    callout.classList.add('is-normal');
    iconEl.setAttribute('data-lucide', 'check-circle-2');
    titleEl.textContent = `Within Monthly Budget (${statusData.rawPercent.toFixed(1)}%)`;
    descEl.textContent = `Spending in ${monthLabel} is on track with ${formatCurrency(
      statusData.remainingBudget
    )} remaining.`;
  }
}

/**
 * Updates the global alert banner shown at the top of the workspace when >= 80% or exceeded.
 * @param {object} statusData
 * @param {string} monthLabel
 */
function renderGlobalBudgetAlert(statusData, monthLabel) {
  const banner = document.getElementById('global-budget-alert');
  const iconEl = document.getElementById('global-budget-alert-icon');
  const titleEl = document.getElementById('global-budget-alert-title');
  const msgEl = document.getElementById('global-budget-alert-message');
  if (!banner || !iconEl || !titleEl || !msgEl) return;

  banner.className = 'alert-banner';

  if (statusData.status === 'exceeded') {
    banner.classList.add('is-danger');
    iconEl.setAttribute('data-lucide', 'alert-octagon');
    titleEl.textContent = 'Budget Exceeded';
    msgEl.textContent = `${monthLabel} spending is at ${statusData.rawPercent.toFixed(
      1
    )}% (${formatCurrency(Math.abs(statusData.remainingBudget))} over limit).`;
  } else if (statusData.status === 'warning') {
    banner.classList.add('is-warning');
    iconEl.setAttribute('data-lucide', 'alert-triangle');
    titleEl.textContent = '80% Budget Warning';
    msgEl.textContent = `${monthLabel} spending has reached ${statusData.rawPercent.toFixed(
      1
    )}% of your ${formatCurrency(statusData.budgetAmount)} budget.`;
  } else {
    banner.classList.add('is-hidden');
  }
}
