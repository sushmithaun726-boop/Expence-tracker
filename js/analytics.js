/**
 * analytics.js — Expense Analytics Computations & Dynamic Charts
 *
 * Calculates category breakdowns, monthly income vs. expense comparisons,
 * spending distribution, highest spending category, and total savings.
 */

import { formatShortMonthTick, getTrailingMonthKeys } from './dashboard.js';
import { getTransactions } from './storage.js';
import {
  escapeHtml,
  formatCurrency,
  formatMonthLabel,
  getCategoryColor,
  getMonthKey,
} from './transactions.js';

let incomeExpenseChartInstance = null;
let categoryBarChartInstance = null;
let distributionChartInstance = null;

/**
 * Pure analytics computation decoupled from DOM and storage.
 * @param {Array<object>} transactions
 * @param {string} activeMonth
 * @param {'month'|'all'} scope
 */
export function computeAnalyticsData(transactions, activeMonth, scope = 'month') {
  const scopedTransactions =
    scope === 'month'
      ? transactions.filter((tx) => getMonthKey(tx.date) === activeMonth)
      : transactions;

  let totalIncome = 0;
  let totalExpenses = 0;
  let expenseCount = 0;
  const categoryMap = new Map();

  for (const tx of scopedTransactions) {
    if (tx.type === 'income') {
      totalIncome += tx.amount;
    } else {
      totalExpenses += tx.amount;
      expenseCount += 1;
      const entry = categoryMap.get(tx.category) || { count: 0, amount: 0 };
      entry.count += 1;
      entry.amount += tx.amount;
      categoryMap.set(tx.category, entry);
    }
  }

  const totalSavings = totalIncome - totalExpenses;
  const savingsRate = totalIncome > 0 ? (totalSavings / totalIncome) * 100 : 0;
  const expenseRatio = totalIncome > 0 ? (totalExpenses / totalIncome) * 100 : 0;
  const avgExpense = expenseCount > 0 ? totalExpenses / expenseCount : 0;

  const categoryTotals = Array.from(categoryMap.entries())
    .map(([category, info]) => ({
      category,
      count: info.count,
      amount: info.amount,
      percent: totalExpenses > 0 ? (info.amount / totalExpenses) * 100 : 0,
      color: getCategoryColor(category),
    }))
    .sort((a, b) => b.amount - a.amount);

  const highestCategory = categoryTotals.length > 0 ? categoryTotals[0] : null;

  // 6-month Income vs Expense comparison ending at activeMonth
  const trailingKeys = getTrailingMonthKeys(activeMonth, 6);
  const monthlyComparison = trailingKeys.map((key) => {
    let income = 0;
    let expense = 0;
    for (const tx of transactions) {
      if (getMonthKey(tx.date) !== key) continue;
      if (tx.type === 'income') income += tx.amount;
      else expense += tx.amount;
    }
    return {
      monthKey: key,
      label: formatShortMonthTick(key),
      income,
      expense,
    };
  });

  return {
    totalIncome,
    totalExpenses,
    totalSavings,
    savingsRate,
    expenseRatio,
    avgExpense,
    expenseCount,
    highestCategory,
    categoryTotals,
    monthlyComparison,
  };
}

/**
 * Initializes the Analytics scope switcher and returns render controller.
 * @param {{ getActiveMonth: () => string }} appContext
 */
export function initAnalyticsModule(appContext) {
  let currentScope = 'month';
  const scopeButtons = document.querySelectorAll('[data-analytics-scope]');

  scopeButtons.forEach((btn) => {
    btn.addEventListener('click', () => {
      const nextScope = btn.getAttribute('data-analytics-scope');
      if (nextScope !== 'month' && nextScope !== 'all') return;
      currentScope = nextScope;

      scopeButtons.forEach((b) => {
        const active = b.getAttribute('data-analytics-scope') === currentScope;
        b.classList.toggle('is-active', active);
        b.setAttribute('aria-pressed', String(active));
      });

      renderAnalytics(appContext.getActiveMonth());
    });
  });

  function renderAnalytics(activeMonth) {
    const transactions = getTransactions();
    const data = computeAnalyticsData(transactions, activeMonth, currentScope);
    const scopeLabel =
      currentScope === 'month' ? formatMonthLabel(activeMonth) : 'All Recorded Months';

    // KPI Cards
    const savingsEl = document.getElementById('analytics-total-savings');
    const savingsRateEl = document.getElementById('analytics-savings-rate');
    const topCatEl = document.getElementById('analytics-top-category');
    const topCatMetaEl = document.getElementById('analytics-top-category-meta');
    const avgExpEl = document.getElementById('analytics-avg-expense');
    const expCountEl = document.getElementById('analytics-expense-count');
    const ratioEl = document.getElementById('analytics-expense-ratio');
    const ratioMetaEl = document.getElementById('analytics-ratio-meta');

    if (savingsEl) {
      savingsEl.textContent = formatCurrency(data.totalSavings);
      savingsEl.className = `kpi-value tabular-nums ${
        data.totalSavings < 0 ? 'text-expense' : 'text-income'
      }`;
    }
    if (savingsRateEl) {
      savingsRateEl.textContent =
        data.totalIncome > 0
          ? `${data.savingsRate.toFixed(1)}% of income saved (${scopeLabel})`
          : `No income recorded (${scopeLabel})`;
    }

    if (topCatEl) {
      topCatEl.textContent = data.highestCategory ? data.highestCategory.category : '—';
    }
    if (topCatMetaEl) {
      topCatMetaEl.textContent = data.highestCategory
        ? `${formatCurrency(data.highestCategory.amount)} (${data.highestCategory.percent.toFixed(1)}% of spending)`
        : 'No expenses recorded';
    }

    if (avgExpEl) avgExpEl.textContent = formatCurrency(data.avgExpense);
    if (expCountEl) {
      expCountEl.textContent = `Across ${data.expenseCount} expense entr${
        data.expenseCount === 1 ? 'y' : 'ies'
      }`;
    }

    if (ratioEl) {
      ratioEl.textContent =
        data.totalIncome > 0 ? `${data.expenseRatio.toFixed(1)}%` : '—';
    }
    if (ratioMetaEl) {
      ratioMetaEl.textContent = `${formatCurrency(data.totalExpenses)} spent vs ${formatCurrency(data.totalIncome)} earned`;
    }

    const barSub = document.getElementById('analytics-bar-subtitle');
    const donutSub = document.getElementById('analytics-donut-subtitle');
    if (barSub) barSub.textContent = `Ranked spending by category (${scopeLabel})`;
    if (donutSub) donutSub.textContent = `Share of total expenses (${scopeLabel})`;

    renderIncomeVsExpenseChart(data.monthlyComparison);
    renderCategoryBarChart(data.categoryTotals);
    renderDistributionChart(data.categoryTotals);
    renderAnalyticsTable(data.categoryTotals);
  }

  return { renderAnalytics };
}

/**
 * Renders the 6-month grouped Income vs Expenses chart.
 * @param {Array<object>} comparison
 */
function renderIncomeVsExpenseChart(comparison) {
  const canvas = document.getElementById('analytics-income-expense-chart');
  const emptyEl = document.getElementById('analytics-income-expense-empty');
  if (!canvas) return;

  const hasData = comparison.some((m) => m.income > 0 || m.expense > 0);
  if (emptyEl) emptyEl.classList.toggle('is-hidden', hasData);
  canvas.classList.toggle('is-hidden', !hasData);

  if (incomeExpenseChartInstance) {
    incomeExpenseChartInstance.destroy();
    incomeExpenseChartInstance = null;
  }

  if (!hasData || typeof window.Chart === 'undefined') return;

  const ctx = canvas.getContext('2d');
  incomeExpenseChartInstance = new window.Chart(ctx, {
    type: 'bar',
    data: {
      labels: comparison.map((m) => m.label),
      datasets: [
        {
          label: 'Income',
          data: comparison.map((m) => m.income),
          backgroundColor: '#16A34A',
          borderRadius: 4,
          maxBarThickness: 28,
        },
        {
          label: 'Expenses',
          data: comparison.map((m) => m.expense),
          backgroundColor: '#0F172A',
          borderRadius: 4,
          maxBarThickness: 28,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          position: 'top',
          align: 'end',
          labels: {
            boxWidth: 10,
            boxHeight: 10,
            usePointStyle: true,
            pointStyle: 'rectRounded',
            color: '#475569',
            font: { family: "'DM Sans', sans-serif", size: 12 },
          },
        },
        tooltip: {
          backgroundColor: '#0F172A',
          padding: 10,
          cornerRadius: 6,
          callbacks: {
            label: (ctxItem) =>
              `${ctxItem.dataset.label}: ${formatCurrency(ctxItem.parsed.y)}`,
          },
        },
      },
      scales: {
        x: {
          grid: { display: false },
          border: { display: false },
          ticks: {
            color: '#64748B',
            font: { family: "'DM Sans', sans-serif", size: 12 },
          },
        },
        y: {
          beginAtZero: true,
          border: { display: false },
          grid: { color: '#F1F5F9' },
          ticks: {
            color: '#64748B',
            font: { family: "'JetBrains Mono', monospace", size: 11 },
            callback: (val) => `$${Number(val).toLocaleString()}`,
          },
        },
      },
    },
  });
}

/**
 * Renders horizontal Category-wise Expense Breakdown bar chart.
 * @param {Array<object>} categoryTotals
 */
function renderCategoryBarChart(categoryTotals) {
  const canvas = document.getElementById('analytics-category-bar-chart');
  const emptyEl = document.getElementById('analytics-category-bar-empty');
  if (!canvas) return;

  const hasData = categoryTotals.length > 0;
  if (emptyEl) emptyEl.classList.toggle('is-hidden', hasData);
  canvas.classList.toggle('is-hidden', !hasData);

  if (categoryBarChartInstance) {
    categoryBarChartInstance.destroy();
    categoryBarChartInstance = null;
  }

  if (!hasData || typeof window.Chart === 'undefined') return;

  const ctx = canvas.getContext('2d');
  categoryBarChartInstance = new window.Chart(ctx, {
    type: 'bar',
    data: {
      labels: categoryTotals.map((c) => c.category),
      datasets: [
        {
          label: 'Total Spent',
          data: categoryTotals.map((c) => c.amount),
          backgroundColor: categoryTotals.map((c) => c.color),
          borderRadius: 4,
          maxBarThickness: 24,
        },
      ],
    },
    options: {
      indexAxis: 'y',
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          backgroundColor: '#0F172A',
          padding: 10,
          cornerRadius: 6,
          callbacks: {
            label: (ctxItem) => `Spent: ${formatCurrency(ctxItem.parsed.x)}`,
          },
        },
      },
      scales: {
        x: {
          beginAtZero: true,
          border: { display: false },
          grid: { color: '#F1F5F9' },
          ticks: {
            color: '#64748B',
            font: { family: "'JetBrains Mono', monospace", size: 11 },
            callback: (val) => `$${Number(val).toLocaleString()}`,
          },
        },
        y: {
          border: { display: false },
          grid: { display: false },
          ticks: {
            color: '#0F172A',
            font: { family: "'DM Sans', sans-serif", size: 12 },
          },
        },
      },
    },
  });
}

/**
 * Renders Spending Distribution doughnut chart.
 * @param {Array<object>} categoryTotals
 */
function renderDistributionChart(categoryTotals) {
  const canvas = document.getElementById('analytics-distribution-chart');
  const emptyEl = document.getElementById('analytics-distribution-empty');
  if (!canvas) return;

  const hasData = categoryTotals.length > 0;
  if (emptyEl) emptyEl.classList.toggle('is-hidden', hasData);
  canvas.classList.toggle('is-hidden', !hasData);

  if (distributionChartInstance) {
    distributionChartInstance.destroy();
    distributionChartInstance = null;
  }

  if (!hasData || typeof window.Chart === 'undefined') return;

  const ctx = canvas.getContext('2d');
  distributionChartInstance = new window.Chart(ctx, {
    type: 'doughnut',
    data: {
      labels: categoryTotals.map((c) => c.category),
      datasets: [
        {
          data: categoryTotals.map((c) => c.amount),
          backgroundColor: categoryTotals.map((c) => c.color),
          borderWidth: 2,
          borderColor: '#FFFFFF',
          hoverOffset: 4,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      cutout: '62%',
      plugins: {
        legend: {
          position: 'right',
          labels: {
            boxWidth: 10,
            boxHeight: 10,
            color: '#475569',
            font: { family: "'DM Sans', sans-serif", size: 12 },
          },
        },
        tooltip: {
          backgroundColor: '#0F172A',
          padding: 10,
          cornerRadius: 6,
          callbacks: {
            label: (ctxItem) => {
              const item = categoryTotals[ctxItem.dataIndex];
              return `${item.category}: ${formatCurrency(item.amount)} (${item.percent.toFixed(1)}%)`;
            },
          },
        },
      },
    },
  });
}

/**
 * Populates the Analytics Category Breakdown Ledger table.
 * @param {Array<object>} categoryTotals
 */
function renderAnalyticsTable(categoryTotals) {
  const tbody = document.getElementById('analytics-category-tbody');
  const emptyEl = document.getElementById('analytics-table-empty');

  if (tbody) {
    tbody.innerHTML = categoryTotals
      .map(
        (item) => `
        <tr>
          <td>
            <span class="legend-left">
              <span class="legend-swatch" style="background-color: ${escapeHtml(item.color)}"></span>
              <span class="tx-title">${escapeHtml(item.category)}</span>
            </span>
          </td>
          <td class="text-right tabular-nums">${item.count}</td>
          <td class="text-right tabular-nums tx-amount">${escapeHtml(formatCurrency(item.amount))}</td>
          <td class="text-right tabular-nums">${item.percent.toFixed(1)}%</td>
        </tr>
      `
      )
      .join('');
  }

  if (emptyEl) {
    emptyEl.classList.toggle('is-hidden', categoryTotals.length > 0);
  }
}
