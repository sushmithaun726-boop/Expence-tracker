/**
 * dashboard.js — Dashboard Calculations & Visualization Rendering
 *
 * Computes all-time and monthly KPIs dynamically from transactions
 * and renders Chart.js overview visualizations.
 */

import { getBudgetForMonth, getTransactions } from './storage.js';
import {
  buildTransactionRowsHtml,
  escapeHtml,
  formatCurrency,
  formatMonthLabel,
  getCategoryColor,
  getMonthKey,
} from './transactions.js';

let spendingChartInstance = null;
let categoryChartInstance = null;

/**
 * Generates an ordered list of N YYYY-MM keys ending at anchorMonth.
 * @param {string} anchorMonth
 * @param {number} count
 * @returns {Array<string>}
 */
export function getTrailingMonthKeys(anchorMonth, count = 6) {
  const [yStr, mStr] = (anchorMonth || '2026-11').split('-');
  const year = Number(yStr) || new Date().getFullYear();
  const month = Number(mStr) || new Date().getMonth() + 1;

  const keys = [];
  for (let i = count - 1; i >= 0; i--) {
    const d = new Date(year, month - 1 - i, 1);
    const kYear = d.getFullYear();
    const kMonth = String(d.getMonth() + 1).padStart(2, '0');
    keys.push(`${kYear}-${kMonth}`);
  }
  return keys;
}

/**
 * Formats YYYY-MM into a concise chart tick label like "Nov 26".
 * @param {string} monthKey
 * @returns {string}
 */
export function formatShortMonthTick(monthKey) {
  const [y, m] = monthKey.split('-').map(Number);
  const d = new Date(y, m - 1, 1);
  return d.toLocaleDateString('en-US', { month: 'short', year: '2-digit' });
}

/**
 * Pure dashboard calculation engine (independent of storage/DOM).
 * @param {Array<object>} transactions
 * @param {string} activeMonth
 * @param {number} budgetAmount
 */
export function computeDashboardMetrics(transactions, activeMonth, budgetAmount = 0) {
  let totalIncome = 0;
  let totalExpenses = 0;
  let monthlySpending = 0;
  let monthlyIncome = 0;

  const categoryTotalsMap = new Map();

  for (const tx of transactions) {
    const txMonth = getMonthKey(tx.date);

    if (tx.type === 'income') {
      totalIncome += tx.amount;
      if (txMonth === activeMonth) {
        monthlyIncome += tx.amount;
      }
    } else {
      totalExpenses += tx.amount;
      if (txMonth === activeMonth) {
        monthlySpending += tx.amount;
        const prev = categoryTotalsMap.get(tx.category) || 0;
        categoryTotalsMap.set(tx.category, prev + tx.amount);
      }
    }
  }

  const totalBalance = totalIncome - totalExpenses;

  const trailingMonths = getTrailingMonthKeys(activeMonth, 6);
  const monthlySeries = trailingMonths.map((key) => {
    const spent = transactions
      .filter((tx) => tx.type === 'expense' && getMonthKey(tx.date) === key)
      .reduce((sum, tx) => sum + tx.amount, 0);
    return {
      monthKey: key,
      label: formatShortMonthTick(key),
      spent,
      isSelected: key === activeMonth,
    };
  });

  const categoryBreakdown = Array.from(categoryTotalsMap.entries())
    .map(([category, amount]) => ({
      category,
      amount,
      percent: monthlySpending > 0 ? (amount / monthlySpending) * 100 : 0,
      color: getCategoryColor(category),
    }))
    .sort((a, b) => b.amount - a.amount);

  const recentTransactions = [...transactions]
    .sort((a, b) => b.date.localeCompare(a.date))
    .slice(0, 6);

  const utilizationPercent =
    budgetAmount > 0 ? Math.round((monthlySpending / budgetAmount) * 1000) / 10 : null;

  return {
    totalBalance,
    totalIncome,
    totalExpenses,
    monthlySpending,
    monthlyIncome,
    utilizationPercent,
    monthlySeries,
    categoryBreakdown,
    recentTransactions,
  };
}

/**
 * Renders the Dashboard view from current transactions and active month.
 * @param {string} activeMonth
 */
export function renderDashboard(activeMonth) {
  const transactions = getTransactions();
  const budgetAmount = getBudgetForMonth(activeMonth);
  const metrics = computeDashboardMetrics(transactions, activeMonth, budgetAmount);
  const monthLabel = formatMonthLabel(activeMonth);

  // Subtitle
  const periodSubtitle = document.getElementById('dashboard-period-subtitle');
  if (periodSubtitle) {
    periodSubtitle.textContent = `All-time ledger balances and ${monthLabel} spending performance`;
  }

  // Sidebar Net Balance
  const sidebarBalance = document.getElementById('sidebar-net-balance');
  if (sidebarBalance) {
    sidebarBalance.textContent = formatCurrency(metrics.totalBalance);
    sidebarBalance.className = `sidebar-summary-value tabular-nums ${
      metrics.totalBalance < 0 ? 'text-expense' : ''
    }`;
  }

  // KPI Cards
  const balanceEl = document.getElementById('kpi-total-balance');
  const incomeEl = document.getElementById('kpi-total-income');
  const expensesEl = document.getElementById('kpi-total-expenses');
  const monthlyEl = document.getElementById('kpi-monthly-spending');
  const balanceMetaEl = document.getElementById('kpi-balance-meta');
  const monthlyMetaEl = document.getElementById('kpi-monthly-meta');

  if (balanceEl) {
    balanceEl.textContent = formatCurrency(metrics.totalBalance);
    balanceEl.className = `kpi-value tabular-nums ${
      metrics.totalBalance < 0 ? 'text-expense' : ''
    }`;
  }
  if (balanceMetaEl) {
    balanceMetaEl.textContent = `Income ${formatCurrency(metrics.totalIncome)} − Expenses ${formatCurrency(metrics.totalExpenses)}`;
  }

  if (incomeEl) incomeEl.textContent = formatCurrency(metrics.totalIncome);
  if (expensesEl) expensesEl.textContent = formatCurrency(metrics.totalExpenses);

  if (monthlyEl) monthlyEl.textContent = formatCurrency(metrics.monthlySpending);
  if (monthlyMetaEl) {
    if (metrics.utilizationPercent !== null) {
      monthlyMetaEl.textContent = `${monthLabel} · ${metrics.utilizationPercent.toFixed(1)}% of ${formatCurrency(budgetAmount)} budget`;
    } else {
      monthlyMetaEl.textContent = `${monthLabel} expenses`;
    }
  }

  // Chart Subtitles
  const catSubtitle = document.getElementById('dashboard-category-chart-subtitle');
  if (catSubtitle) {
    catSubtitle.textContent = `Distribution for ${monthLabel}`;
  }

  renderSpendingOverviewChart(metrics.monthlySeries);
  renderCategoryBreakdownChart(metrics.categoryBreakdown);
  renderRecentTransactionsTable(metrics.recentTransactions);

  if (window.lucide) {
    window.lucide.createIcons();
  }
}

/**
 * Renders the 6-month Monthly Spending Overview bar chart.
 * @param {Array<object>} series
 */
function renderSpendingOverviewChart(series) {
  const canvas = document.getElementById('dashboard-spending-chart');
  const emptyEl = document.getElementById('dashboard-spending-empty');
  if (!canvas) return;

  const hasData = series.some((item) => item.spent > 0);
  if (emptyEl) emptyEl.classList.toggle('is-hidden', hasData);
  canvas.classList.toggle('is-hidden', !hasData);

  if (spendingChartInstance) {
    spendingChartInstance.destroy();
    spendingChartInstance = null;
  }

  if (!hasData || typeof window.Chart === 'undefined') return;

  const ctx = canvas.getContext('2d');
  spendingChartInstance = new window.Chart(ctx, {
    type: 'bar',
    data: {
      labels: series.map((item) => item.label),
      datasets: [
        {
          label: 'Monthly Spending',
          data: series.map((item) => item.spent),
          backgroundColor: series.map((item) =>
            item.isSelected ? '#2563EB' : '#CBD5E1'
          ),
          hoverBackgroundColor: series.map((item) =>
            item.isSelected ? '#1D4ED8' : '#94A3B8'
          ),
          borderRadius: 5,
          maxBarThickness: 42,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          backgroundColor: '#0F172A',
          padding: 10,
          cornerRadius: 6,
          callbacks: {
            label: (context) => `Spent: ${formatCurrency(context.parsed.y)}`,
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
 * Renders the Expense Category Breakdown doughnut chart and custom legend.
 * @param {Array<object>} breakdown
 */
function renderCategoryBreakdownChart(breakdown) {
  const canvas = document.getElementById('dashboard-category-chart');
  const emptyEl = document.getElementById('dashboard-category-empty');
  const legendEl = document.getElementById('dashboard-category-legend');
  if (!canvas) return;

  const hasData = breakdown.length > 0;
  if (emptyEl) emptyEl.classList.toggle('is-hidden', hasData);
  canvas.classList.toggle('is-hidden', !hasData);

  if (categoryChartInstance) {
    categoryChartInstance.destroy();
    categoryChartInstance = null;
  }

  if (legendEl) {
    legendEl.innerHTML = hasData
      ? breakdown
          .slice(0, 6)
          .map(
            (item) => `
          <li class="category-legend-item">
            <span class="legend-left">
              <span class="legend-swatch" style="background-color: ${escapeHtml(item.color)}"></span>
              <span class="legend-name">${escapeHtml(item.category)}</span>
            </span>
            <span class="legend-right tabular-nums">
              <span>${escapeHtml(formatCurrency(item.amount))}</span>
              <span class="legend-percent">${item.percent.toFixed(0)}%</span>
            </span>
          </li>
        `
          )
          .join('')
      : '<li class="meta-text">Add expenses for this month to view category shares.</li>';
  }

  if (!hasData || typeof window.Chart === 'undefined') return;

  const ctx = canvas.getContext('2d');
  categoryChartInstance = new window.Chart(ctx, {
    type: 'doughnut',
    data: {
      labels: breakdown.map((item) => item.category),
      datasets: [
        {
          data: breakdown.map((item) => item.amount),
          backgroundColor: breakdown.map((item) => item.color),
          borderWidth: 2,
          borderColor: '#FFFFFF',
          hoverOffset: 4,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      cutout: '66%',
      plugins: {
        legend: { display: false },
        tooltip: {
          backgroundColor: '#0F172A',
          padding: 10,
          cornerRadius: 6,
          callbacks: {
            label: (context) => {
              const item = breakdown[context.dataIndex];
              return `${item.category}: ${formatCurrency(item.amount)} (${item.percent.toFixed(1)}%)`;
            },
          },
        },
      },
    },
  });
}

/**
 * Renders the Recent Transactions table on the Dashboard.
 * @param {Array<object>} rows
 */
function renderRecentTransactionsTable(rows) {
  const tbody = document.getElementById('dashboard-recent-tbody');
  const emptyEl = document.getElementById('dashboard-recent-empty');

  if (tbody) {
    tbody.innerHTML = buildTransactionRowsHtml(rows);
  }
  if (emptyEl) {
    emptyEl.classList.toggle('is-hidden', rows.length > 0);
  }
}
