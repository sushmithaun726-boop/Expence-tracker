/**
 * app.js — Application Entry Point & View Coordinator
 *
 * Bootstraps LocalStorage, initializes feature modules, manages navigation
 * across the 5 core views, coordinates global month filtering, modals,
 * mobile sidebar drawer, and toast notifications.
 */

import { initAnalyticsModule } from './analytics.js';
import { initBudgetModule } from './budget.js';
import { renderDashboard } from './dashboard.js';
import {
  clearAllData,
  getTodayISO,
  initStorage,
  resetToSampleData,
} from './storage.js';
import { getMonthKey, initTransactionsModule } from './transactions.js';

const VIEW_TITLES = {
  dashboard: 'Dashboard',
  add: 'Add Transaction',
  transactions: 'Transaction History',
  analytics: 'Expense Analytics',
  budget: 'Budget Management',
};

document.addEventListener('DOMContentLoaded', () => {
  // 1. Initialize LocalStorage (seeds sample data only on very first visit)
  initStorage();

  // 2. State
  let activeView = 'dashboard';
  let activeMonth = getMonthKey(getTodayISO()) || '2026-11';

  const monthInput = document.getElementById('global-month-select');
  if (monthInput) {
    monthInput.value = activeMonth;
  }

  // 3. Modal & Toast Helpers
  function openModal(modalId) {
    const modal = document.getElementById(modalId);
    if (!modal) return;
    modal.classList.remove('is-hidden');
    if (window.lucide) {
      window.lucide.createIcons();
    }
    const focusTarget = modal.querySelector('input:not([type="hidden"]), button, select');
    if (focusTarget) {
      setTimeout(() => focusTarget.focus(), 20);
    }
  }

  function closeModal(modalId) {
    const modal = document.getElementById(modalId);
    if (!modal) return;
    modal.classList.add('is-hidden');
  }

  function showToast(message, isError = false) {
    const container = document.getElementById('toast-container');
    if (!container || !message) return;

    const toast = document.createElement('div');
    toast.className = `toast${isError ? ' is-error' : ''}`;
    toast.innerHTML = `
      <i data-lucide="${isError ? 'alert-circle' : 'check-circle-2'}"></i>
      <span></span>
    `;
    toast.querySelector('span').textContent = message;
    container.appendChild(toast);

    if (window.lucide) {
      window.lucide.createIcons();
    }

    setTimeout(() => {
      toast.remove();
    }, 3200);
  }

  // 4. Mobile Sidebar Drawer Controls
  const sidebar = document.getElementById('sidebar');
  const backdrop = document.getElementById('sidebar-backdrop');
  const openSidebarBtn = document.getElementById('sidebar-open-btn');
  const closeSidebarBtn = document.getElementById('sidebar-close-btn');

  function setSidebarOpen(isOpen) {
    if (!sidebar || !backdrop) return;
    sidebar.classList.toggle('is-open', isOpen);
    backdrop.classList.toggle('is-visible', isOpen);
    if (openSidebarBtn) {
      openSidebarBtn.setAttribute('aria-expanded', String(isOpen));
    }
  }

  if (openSidebarBtn) {
    openSidebarBtn.addEventListener('click', () => setSidebarOpen(true));
  }
  if (closeSidebarBtn) {
    closeSidebarBtn.addEventListener('click', () => setSidebarOpen(false));
  }
  if (backdrop) {
    backdrop.addEventListener('click', () => setSidebarOpen(false));
  }

  // 5. Initialize Feature Modules
  const appContext = {
    getActiveMonth: () => activeMonth,
    openModal,
    closeModal,
    showToast,
    onDataChanged: (opts = {}) => {
      if (opts.syncMonth && /^\d{4}-\d{2}$/.test(opts.syncMonth)) {
        activeMonth = opts.syncMonth;
        if (monthInput) monthInput.value = activeMonth;
      }
      refreshAllViews();
      if (opts.message) {
        showToast(opts.message, Boolean(opts.isError));
      }
    },
  };

  const transactionsCtrl = initTransactionsModule(appContext);
  const analyticsCtrl = initAnalyticsModule(appContext);
  const budgetCtrl = initBudgetModule(appContext);

  // 6. Central Re-Render Coordinator
  function refreshAllViews() {
    renderDashboard(activeMonth);
    transactionsCtrl.renderTransactionHistory();
    transactionsCtrl.renderAddSnapshot(activeMonth);
    analyticsCtrl.renderAnalytics(activeMonth);
    budgetCtrl.renderBudget(activeMonth);

    if (window.lucide) {
      window.lucide.createIcons();
    }
  }

  // 7. Navigation & Routing
  const navItems = document.querySelectorAll('.nav-item[data-view]');
  const viewSections = document.querySelectorAll('.view-section');
  const topbarTitle = document.getElementById('topbar-title');

  function navigateToView(viewName) {
    if (!VIEW_TITLES[viewName]) return;
    activeView = viewName;

    navItems.forEach((btn) => {
      const isMatch = btn.getAttribute('data-view') === viewName;
      btn.classList.toggle('is-active', isMatch);
      if (isMatch) {
        btn.setAttribute('aria-current', 'page');
      } else {
        btn.removeAttribute('aria-current');
      }
    });

    viewSections.forEach((section) => {
      section.classList.toggle('is-active', section.id === `view-${viewName}`);
    });

    if (topbarTitle) {
      topbarTitle.textContent = VIEW_TITLES[viewName];
    }

    // Re-render on view switch so Chart.js canvases resize cleanly when visible
    refreshAllViews();
    setSidebarOpen(false);
  }

  navItems.forEach((btn) => {
    btn.addEventListener('click', () => {
      const target = btn.getAttribute('data-view');
      if (target) navigateToView(target);
    });
  });

  document.addEventListener('click', (event) => {
    const gotoBtn = event.target.closest('[data-goto-view]');
    if (gotoBtn) {
      const view = gotoBtn.getAttribute('data-goto-view');
      if (view) navigateToView(view);
      return;
    }

    const navLink = event.target.closest('[data-nav-link]');
    if (navLink) {
      event.preventDefault();
      const view = navLink.getAttribute('data-nav-link');
      if (view) navigateToView(view);
      return;
    }

    const closeModalBtn = event.target.closest('[data-close-modal]');
    if (closeModalBtn) {
      const modalId = closeModalBtn.getAttribute('data-close-modal');
      if (modalId) closeModal(modalId);
    }
  });

  // Close modal when clicking overlay backdrop or pressing Escape
  document.querySelectorAll('.modal-overlay').forEach((overlay) => {
    overlay.addEventListener('click', (event) => {
      if (event.target === overlay) {
        overlay.classList.add('is-hidden');
      }
    });
  });

  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') {
      document
        .querySelectorAll('.modal-overlay:not(.is-hidden)')
        .forEach((modal) => modal.classList.add('is-hidden'));
      setSidebarOpen(false);
    }
  });

  // Topbar Primary CTA & Month Picker
  const topbarAddBtn = document.getElementById('topbar-add-btn');
  if (topbarAddBtn) {
    topbarAddBtn.addEventListener('click', () => {
      navigateToView('add');
      const titleInput = document.getElementById('add-title');
      if (titleInput) setTimeout(() => titleInput.focus(), 40);
    });
  }

  if (monthInput) {
    monthInput.addEventListener('change', (event) => {
      const nextMonth = event.target.value;
      if (/^\d{4}-\d{2}$/.test(nextMonth)) {
        activeMonth = nextMonth;
        refreshAllViews();
      }
    });
  }

  // Sidebar Utilities: Export CSV & Data Management Modal
  const exportCsvBtn = document.getElementById('export-csv-btn');
  if (exportCsvBtn) {
    exportCsvBtn.addEventListener('click', () => transactionsCtrl.exportCSV());
  }

  const openResetModalBtn = document.getElementById('open-reset-modal-btn');
  if (openResetModalBtn) {
    openResetModalBtn.addEventListener('click', () => openModal('reset-confirm-modal'));
  }

  const restoreSampleBtn = document.getElementById('restore-sample-btn');
  if (restoreSampleBtn) {
    restoreSampleBtn.addEventListener('click', () => {
      resetToSampleData();
      closeModal('reset-confirm-modal');
      activeMonth = getMonthKey(getTodayISO()) || '2026-11';
      if (monthInput) monthInput.value = activeMonth;
      refreshAllViews();
      showToast('Sample ledger data restored.');
    });
  }

  const clearAllBtn = document.getElementById('clear-all-data-btn');
  if (clearAllBtn) {
    clearAllBtn.addEventListener('click', () => {
      clearAllData();
      closeModal('reset-confirm-modal');
      refreshAllViews();
      showToast('All local transactions and budgets cleared.');
    });
  }

  // 8. Initial Render
  navigateToView(activeView);
});
