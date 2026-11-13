/**
 * transactions.js — Transaction Domain Logic, Validation, Filtering & UI
 *
 * Pure business logic functions are decoupled from LocalStorage so they work
 * identically with any future REST API data source.
 */

import {
  addTransaction,
  deleteTransaction,
  getBudgetForMonth,
  getTodayISO,
  getTransactionById,
  getTransactions,
  updateTransaction,
} from './storage.js';

export const EXPENSE_CATEGORIES = [
  'Food',
  'Housing',
  'Transport',
  'Utilities',
  'Healthcare',
  'Shopping',
  'Entertainment',
  'Education',
  'Other',
];

export const INCOME_CATEGORIES = [
  'Salary',
  'Freelance',
  'Investments',
  'Gifts',
  'Refunds',
  'Other',
];

export const ALL_CATEGORIES = Array.from(
  new Set([...EXPENSE_CATEGORIES, ...INCOME_CATEGORIES])
);

const CATEGORY_COLORS = {
  Food: '#2563EB',
  Housing: '#0F172A',
  Transport: '#0284C7',
  Utilities: '#7C3AED',
  Healthcare: '#059669',
  Shopping: '#D97706',
  Entertainment: '#DB2777',
  Education: '#4F46E5',
  Salary: '#16A34A',
  Freelance: '#0D9488',
  Investments: '#0284C7',
  Gifts: '#CA8A04',
  Refunds: '#65A30D',
  Other: '#64748B',
};

/**
 * Returns consistent chart/legend color for a given category.
 * @param {string} category
 * @returns {string}
 */
export function getCategoryColor(category) {
  return CATEGORY_COLORS[category] || '#64748B';
}

/**
 * Formats a numeric amount as USD currency.
 * @param {number} amount
 * @returns {string}
 */
export function formatCurrency(amount) {
  const num = Number(amount) || 0;
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(num);
}

/**
 * Formats an ISO date string (YYYY-MM-DD) into a readable short date.
 * @param {string} isoDate
 * @returns {string}
 */
export function formatDate(isoDate) {
  if (!isoDate) return '—';
  const parts = String(isoDate).split('-');
  if (parts.length !== 3) return isoDate;
  const year = Number(parts[0]);
  const month = Number(parts[1]) - 1;
  const day = Number(parts[2]);
  const dateObj = new Date(year, month, day);
  if (Number.isNaN(dateObj.getTime())) return isoDate;
  return dateObj.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

/**
 * Formats a YYYY-MM month key into "Month Year" (e.g., "November 2026").
 * @param {string} monthKey
 * @returns {string}
 */
export function formatMonthLabel(monthKey) {
  if (!monthKey || !/^\d{4}-\d{2}$/.test(monthKey)) return 'Selected Month';
  const [year, month] = monthKey.split('-').map(Number);
  const d = new Date(year, month - 1, 1);
  return d.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
}

/**
 * Extracts YYYY-MM from a YYYY-MM-DD date string.
 * @param {string} isoDate
 * @returns {string}
 */
export function getMonthKey(isoDate) {
  return isoDate ? String(isoDate).slice(0, 7) : '';
}

/**
 * Escapes HTML special characters to prevent XSS in template strings.
 * @param {string} text
 * @returns {string}
 */
export function escapeHtml(text) {
  const map = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  };
  return String(text || '').replace(/[&<>"']/g, (char) => map[char]);
}

/**
 * Validates transaction form input before saving.
 * @param {object} input
 * @returns {{ valid: boolean, errors: Record<string, string> }}
 */
export function validateTransactionInput(input) {
  const errors = {};

  const title = String(input.title || '').trim();
  if (!title) {
    errors.title = 'Please enter a transaction title.';
  } else if (title.length < 2) {
    errors.title = 'Title must be at least 2 characters.';
  } else if (title.length > 80) {
    errors.title = 'Title cannot exceed 80 characters.';
  }

  const amount = Number(input.amount);
  if (input.amount === '' || input.amount === null || input.amount === undefined) {
    errors.amount = 'Please enter an amount.';
  } else if (!Number.isFinite(amount) || amount <= 0) {
    errors.amount = 'Amount must be greater than $0.00.';
  } else if (amount > 100000000) {
    errors.amount = 'Amount exceeds the maximum allowed value.';
  }

  const type = input.type;
  if (type !== 'income' && type !== 'expense') {
    errors.type = 'Select income or expense.';
  }

  const category = String(input.category || '').trim();
  if (!category) {
    errors.category = 'Please choose a category.';
  }

  const date = String(input.date || '').trim();
  if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    errors.date = 'Please select a valid date.';
  }

  const description = String(input.description || '').trim();
  if (description.length > 240) {
    errors.description = 'Description cannot exceed 240 characters.';
  }

  return {
    valid: Object.keys(errors).length === 0,
    errors,
  };
}

/**
 * Pure filter & sort function for transaction lists.
 * @param {Array<object>} transactions
 * @param {{ search?: string, type?: string, category?: string, sort?: string }} filters
 * @returns {Array<object>}
 */
export function filterAndSortTransactions(transactions, filters = {}) {
  const query = String(filters.search || '').trim().toLowerCase();
  const typeFilter = filters.type || 'all';
  const categoryFilter = filters.category || 'all';
  const sortOrder = filters.sort || 'date-desc';

  const filtered = transactions.filter((tx) => {
    if (typeFilter !== 'all' && tx.type !== typeFilter) return false;
    if (categoryFilter !== 'all' && tx.category !== categoryFilter) return false;

    if (query) {
      const haystack = `${tx.title} ${tx.description} ${tx.category} ${tx.amount}`.toLowerCase();
      if (!haystack.includes(query)) return false;
    }
    return true;
  });

  const sorted = [...filtered].sort((a, b) => {
    if (sortOrder === 'date-asc') {
      return a.date.localeCompare(b.date);
    }
    if (sortOrder === 'amount-desc') {
      return b.amount - a.amount || b.date.localeCompare(a.date);
    }
    if (sortOrder === 'amount-asc') {
      return a.amount - b.amount || b.date.localeCompare(a.date);
    }
    // Default: date-desc
    return b.date.localeCompare(a.date);
  });

  return sorted;
}

/**
 * Computes net totals for any array of transactions.
 * @param {Array<object>} transactions
 * @returns {{ totalIncome: number, totalExpenses: number, netBalance: number }}
 */
export function summarizeTransactions(transactions) {
  let totalIncome = 0;
  let totalExpenses = 0;

  for (const tx of transactions) {
    if (tx.type === 'income') {
      totalIncome += tx.amount;
    } else {
      totalExpenses += tx.amount;
    }
  }

  return {
    totalIncome,
    totalExpenses,
    netBalance: totalIncome - totalExpenses,
  };
}

/**
 * Renders an array of transaction table rows as HTML.
 * @param {Array<object>} rows
 * @returns {string}
 */
export function buildTransactionRowsHtml(rows) {
  return rows
    .map((tx) => {
      const isIncome = tx.type === 'income';
      const sign = isIncome ? '+' : '-';
      const amountClass = isIncome ? 'text-income' : 'text-expense';
      const typeLabel = isIncome ? 'Income' : 'Expense';
      const typeIcon = isIncome ? 'arrow-down-left' : 'arrow-up-right';
      const descHtml = tx.description
        ? `<div class="tx-desc" title="${escapeHtml(tx.description)}">${escapeHtml(tx.description)}</div>`
        : '';

      return `
        <tr data-tx-id="${escapeHtml(tx.id)}">
          <td class="tabular-nums">${escapeHtml(formatDate(tx.date))}</td>
          <td>
            <div class="tx-title">${escapeHtml(tx.title)}</div>
            ${descHtml}
          </td>
          <td class="tx-category">${escapeHtml(tx.category)}</td>
          <td>
            <span class="tx-type ${amountClass}">
              <i data-lucide="${typeIcon}"></i>
              <span>${typeLabel}</span>
            </span>
          </td>
          <td class="text-right tx-amount tabular-nums ${amountClass}">
            ${sign}${escapeHtml(formatCurrency(tx.amount))}
          </td>
          <td class="text-right">
            <div class="row-actions">
              <button
                type="button"
                class="table-action-btn"
                data-action="edit"
                data-tx-id="${escapeHtml(tx.id)}"
                aria-label="Edit ${escapeHtml(tx.title)}"
                title="Edit transaction"
              >
                <i data-lucide="pencil"></i>
              </button>
              <button
                type="button"
                class="table-action-btn is-delete"
                data-action="delete"
                data-tx-id="${escapeHtml(tx.id)}"
                aria-label="Delete ${escapeHtml(tx.title)}"
                title="Delete transaction"
              >
                <i data-lucide="trash-2"></i>
              </button>
            </div>
          </td>
        </tr>
      `;
    })
    .join('');
}

/**
 * Populates a <select> element with categories matching the given type.
 * @param {HTMLSelectElement} selectEl
 * @param {'income'|'expense'} type
 * @param {string} [selectedValue]
 */
function populateCategorySelect(selectEl, type, selectedValue = '') {
  if (!selectEl) return;
  const list = type === 'income' ? INCOME_CATEGORIES : EXPENSE_CATEGORIES;
  selectEl.innerHTML = list
    .map(
      (cat) =>
        `<option value="${escapeHtml(cat)}"${cat === selectedValue ? ' selected' : ''}>${escapeHtml(cat)}</option>`
    )
    .join('');
}

/**
 * Displays inline validation errors on a form prefix ('add' or 'edit').
 * @param {'add'|'edit'} prefix
 * @param {Record<string, string>} errors
 */
function displayFormErrors(prefix, errors) {
  const fields = ['title', 'amount', 'category', 'date', 'description'];
  for (const field of fields) {
    const input = document.getElementById(`${prefix}-${field}`);
    const errorEl = document.getElementById(`${prefix}-${field}-error`);
    const message = errors[field] || '';

    if (errorEl) {
      errorEl.textContent = message;
    }
    if (input) {
      input.classList.toggle('is-invalid', Boolean(message));
    }
  }
}

/**
 * Clears all inline validation errors on a form prefix.
 * @param {'add'|'edit'} prefix
 */
export function clearFormErrors(prefix) {
  displayFormErrors(prefix, {});
}

/**
 * Initializes the Add Transaction form, Transaction History filters,
 * and Edit/Delete modal workflows.
 * @param {object} appContext
 */
export function initTransactionsModule(appContext) {
  // --- Add Form Elements ---
  const addForm = document.getElementById('add-transaction-form');
  const addTypeInput = document.getElementById('add-type');
  const addCategorySelect = document.getElementById('add-category');
  const addDateInput = document.getElementById('add-date');
  const addResetBtn = document.getElementById('add-reset-btn');
  const addTypeButtons = document.querySelectorAll('[data-type-option]');

  // --- History Filter Elements ---
  const searchInput = document.getElementById('filter-search');
  const typeSelect = document.getElementById('filter-type');
  const categorySelect = document.getElementById('filter-category');
  const sortSelect = document.getElementById('filter-sort');
  const filterResetBtn = document.getElementById('filter-reset-btn');
  const emptyResetBtn = document.getElementById('empty-reset-filters-btn');

  // --- Edit Form Elements ---
  const editForm = document.getElementById('edit-transaction-form');
  const editTypeInput = document.getElementById('edit-type');
  const editCategorySelect = document.getElementById('edit-category');
  const editTypeButtons = document.querySelectorAll('[data-edit-type-option]');

  // --- Delete Modal Elements ---
  const confirmDeleteBtn = document.getElementById('confirm-delete-btn');
  let pendingDeleteId = null;

  // Populate Filter Category Dropdown
  if (categorySelect) {
    categorySelect.innerHTML = [
      '<option value="all">All Categories</option>',
      ...ALL_CATEGORIES.map(
        (cat) => `<option value="${escapeHtml(cat)}">${escapeHtml(cat)}</option>`
      ),
    ].join('');
  }

  // Initialize Add Form Defaults
  function resetAddForm() {
    if (!addForm) return;
    addForm.reset();
    clearFormErrors('add');
    setAddType('expense');
    if (addDateInput) {
      addDateInput.value = getTodayISO();
    }
  }

  function setAddType(type) {
    const cleanType = type === 'income' ? 'income' : 'expense';
    if (addTypeInput) addTypeInput.value = cleanType;

    addTypeButtons.forEach((btn) => {
      const isActive = btn.getAttribute('data-type-option') === cleanType;
      btn.classList.toggle('is-active', isActive);
      btn.setAttribute('aria-pressed', String(isActive));
    });

    populateCategorySelect(addCategorySelect, cleanType);
  }

  function setEditType(type, preferredCategory = '') {
    const cleanType = type === 'income' ? 'income' : 'expense';
    if (editTypeInput) editTypeInput.value = cleanType;

    editTypeButtons.forEach((btn) => {
      const isActive = btn.getAttribute('data-edit-type-option') === cleanType;
      btn.classList.toggle('is-active', isActive);
      btn.setAttribute('aria-pressed', String(isActive));
    });

    populateCategorySelect(editCategorySelect, cleanType, preferredCategory);
  }

  addTypeButtons.forEach((btn) => {
    btn.addEventListener('click', () => {
      setAddType(btn.getAttribute('data-type-option'));
    });
  });

  editTypeButtons.forEach((btn) => {
    btn.addEventListener('click', () => {
      setEditType(btn.getAttribute('data-edit-type-option'));
    });
  });

  if (addResetBtn) {
    addResetBtn.addEventListener('click', resetAddForm);
  }

  if (addForm) {
    addForm.addEventListener('submit', (event) => {
      event.preventDefault();
      const payload = {
        type: addTypeInput ? addTypeInput.value : 'expense',
        title: document.getElementById('add-title')?.value || '',
        amount: document.getElementById('add-amount')?.value || '',
        category: addCategorySelect ? addCategorySelect.value : '',
        date: addDateInput ? addDateInput.value : '',
        description: document.getElementById('add-description')?.value || '',
      };

      const validation = validateTransactionInput(payload);
      if (!validation.valid) {
        displayFormErrors('add', validation.errors);
        return;
      }

      clearFormErrors('add');
      const created = addTransaction(payload);
      resetAddForm();

      // Sync active month to the newly added transaction's month if desired, or keep current
      appContext.onDataChanged({
        syncMonth: getMonthKey(created.date),
        message: `${created.type === 'income' ? 'Income' : 'Expense'} "${created.title}" saved.`,
      });
    });
  }

  // Edit Form Submission
  if (editForm) {
    editForm.addEventListener('submit', (event) => {
      event.preventDefault();
      const id = document.getElementById('edit-id')?.value || '';
      const payload = {
        type: editTypeInput ? editTypeInput.value : 'expense',
        title: document.getElementById('edit-title')?.value || '',
        amount: document.getElementById('edit-amount')?.value || '',
        category: editCategorySelect ? editCategorySelect.value : '',
        date: document.getElementById('edit-date')?.value || '',
        description: document.getElementById('edit-description')?.value || '',
      };

      const validation = validateTransactionInput(payload);
      if (!validation.valid) {
        displayFormErrors('edit', validation.errors);
        return;
      }

      clearFormErrors('edit');
      const updated = updateTransaction(id, payload);
      appContext.closeModal('edit-transaction-modal');

      if (updated) {
        appContext.onDataChanged({
          message: `Updated "${updated.title}".`,
        });
      }
    });
  }

  // Delete Confirmation Handler
  if (confirmDeleteBtn) {
    confirmDeleteBtn.addEventListener('click', () => {
      if (!pendingDeleteId) return;
      const existing = getTransactionById(pendingDeleteId);
      const removed = deleteTransaction(pendingDeleteId);
      pendingDeleteId = null;
      appContext.closeModal('delete-confirm-modal');

      if (removed) {
        appContext.onDataChanged({
          message: existing
            ? `Deleted "${existing.title}".`
            : 'Transaction deleted.',
        });
      }
    });
  }

  // Filter Event Listeners
  function resetFilters() {
    if (searchInput) searchInput.value = '';
    if (typeSelect) typeSelect.value = 'all';
    if (categorySelect) categorySelect.value = 'all';
    if (sortSelect) sortSelect.value = 'date-desc';
    renderTransactionHistory();
  }

  [searchInput, typeSelect, categorySelect, sortSelect].forEach((el) => {
    if (!el) return;
    el.addEventListener('input', () => renderTransactionHistory());
    el.addEventListener('change', () => renderTransactionHistory());
  });

  if (filterResetBtn) {
    filterResetBtn.addEventListener('click', resetFilters);
  }
  if (emptyResetBtn) {
    emptyResetBtn.addEventListener('click', resetFilters);
  }

  // Delegated Edit/Delete handlers for both Dashboard Recent table & History table
  function handleTableActionClick(event) {
    const btn = event.target.closest('[data-action]');
    if (!btn) return;
    const action = btn.getAttribute('data-action');
    const txId = btn.getAttribute('data-tx-id');
    if (!txId) return;

    if (action === 'edit') {
      openEditModal(txId);
    } else if (action === 'delete') {
      openDeleteModal(txId);
    }
  }

  const historyTbody = document.getElementById('transactions-table-body');
  const dashboardTbody = document.getElementById('dashboard-recent-tbody');
  if (historyTbody) historyTbody.addEventListener('click', handleTableActionClick);
  if (dashboardTbody) dashboardTbody.addEventListener('click', handleTableActionClick);

  function openEditModal(id) {
    const tx = getTransactionById(id);
    if (!tx) return;

    clearFormErrors('edit');
    document.getElementById('edit-id').value = tx.id;
    document.getElementById('edit-title').value = tx.title;
    document.getElementById('edit-amount').value = tx.amount;
    document.getElementById('edit-date').value = tx.date;
    document.getElementById('edit-description').value = tx.description || '';
    setEditType(tx.type, tx.category);

    appContext.openModal('edit-transaction-modal');
  }

  function openDeleteModal(id) {
    const tx = getTransactionById(id);
    if (!tx) return;
    pendingDeleteId = id;
    const targetNameEl = document.getElementById('delete-target-name');
    if (targetNameEl) {
      targetNameEl.textContent = `"${tx.title}" (${formatCurrency(tx.amount)})`;
    }
    appContext.openModal('delete-confirm-modal');
  }

  // Initialize default add form values on load
  resetAddForm();

  return {
    renderTransactionHistory,
    renderAddSnapshot,
    exportCSV,
  };

  /**
   * Renders the Transaction History view based on active filters.
   */
  function renderTransactionHistory() {
    const allTransactions = getTransactions();
    const filters = {
      search: searchInput ? searchInput.value : '',
      type: typeSelect ? typeSelect.value : 'all',
      category: categorySelect ? categorySelect.value : 'all',
      sort: sortSelect ? sortSelect.value : 'date-desc',
    };

    const filtered = filterAndSortTransactions(allTransactions, filters);
    const summary = summarizeTransactions(filtered);

    const tbody = document.getElementById('transactions-table-body');
    const emptyState = document.getElementById('transactions-empty-state');
    const emptyTitle = document.getElementById('transactions-empty-title');
    const emptyDesc = document.getElementById('transactions-empty-desc');
    const countMeta = document.getElementById('transactions-count-meta');
    const netMeta = document.getElementById('transactions-net-meta');

    if (countMeta) {
      countMeta.textContent =
        allTransactions.length === filtered.length
          ? `${filtered.length} transaction${filtered.length === 1 ? '' : 's'}`
          : `Showing ${filtered.length} of ${allTransactions.length} transactions`;
    }

    if (netMeta) {
      const prefix = summary.netBalance >= 0 ? '+' : '';
      netMeta.textContent = `Filtered Net: ${prefix}${formatCurrency(summary.netBalance)}`;
    }

    if (tbody) {
      tbody.innerHTML = buildTransactionRowsHtml(filtered);
    }

    if (emptyState) {
      const isEmpty = filtered.length === 0;
      emptyState.classList.toggle('is-hidden', !isEmpty);
      if (isEmpty && emptyTitle && emptyDesc) {
        if (allTransactions.length === 0) {
          emptyTitle.textContent = 'Your ledger is empty';
          emptyDesc.textContent =
            'Add your first income or expense transaction to start tracking your finances.';
          if (emptyResetBtn) emptyResetBtn.classList.add('is-hidden');
        } else {
          emptyTitle.textContent = 'No matching transactions';
          emptyDesc.textContent =
            'Adjust your search query or filters to see your recorded transactions.';
          if (emptyResetBtn) emptyResetBtn.classList.remove('is-hidden');
        }
      }
    }

    if (window.lucide) {
      window.lucide.createIcons();
    }
  }

  /**
   * Updates the live Ledger Snapshot sidebar card on the Add Transaction view.
   * @param {string} activeMonth
   */
  function renderAddSnapshot(activeMonth) {
    const transactions = getTransactions();
    const allSummary = summarizeTransactions(transactions);
    const monthExpenses = transactions
      .filter((tx) => tx.type === 'expense' && getMonthKey(tx.date) === activeMonth)
      .reduce((acc, tx) => acc + tx.amount, 0);

    const budgetLimit = getBudgetForMonth(activeMonth);

    const balanceEl = document.getElementById('add-snapshot-balance');
    const spentEl = document.getElementById('add-snapshot-month-spent');
    const budgetLeftEl = document.getElementById('add-snapshot-budget-left');

    if (balanceEl) {
      balanceEl.textContent = formatCurrency(allSummary.netBalance);
      balanceEl.className = `tabular-nums ${allSummary.netBalance >= 0 ? 'text-income' : 'text-expense'}`;
    }

    if (spentEl) {
      spentEl.textContent = formatCurrency(monthExpenses);
    }

    if (budgetLeftEl) {
      if (budgetLimit <= 0) {
        budgetLeftEl.textContent = 'No budget set';
        budgetLeftEl.className = 'tabular-nums';
      } else {
        const remaining = budgetLimit - monthExpenses;
        budgetLeftEl.textContent =
          remaining >= 0
            ? formatCurrency(remaining)
            : `-${formatCurrency(Math.abs(remaining))}`;
        budgetLeftEl.className = `tabular-nums ${remaining < 0 ? 'text-expense' : ''}`;
      }
    }
  }

  /**
   * Exports all recorded transactions as a downloadable CSV file.
   */
  function exportCSV() {
    const transactions = filterAndSortTransactions(getTransactions(), {
      sort: 'date-desc',
    });

    if (transactions.length === 0) {
      appContext.showToast('No transactions available to export.', true);
      return;
    }

    const headers = ['ID', 'Date', 'Title', 'Type', 'Category', 'Amount', 'Description'];
    const csvEscape = (val) => `"${String(val ?? '').replace(/"/g, '""')}"`;

    const lines = [
      headers.join(','),
      ...transactions.map((tx) =>
        [
          csvEscape(tx.id),
          csvEscape(tx.date),
          csvEscape(tx.title),
          csvEscape(tx.type),
          csvEscape(tx.category),
          tx.amount.toFixed(2),
          csvEscape(tx.description),
        ].join(',')
      ),
    ];

    const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `clearledger-transactions-${getTodayISO()}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);

    appContext.showToast(`Exported ${transactions.length} transactions to CSV.`);
  }
}
