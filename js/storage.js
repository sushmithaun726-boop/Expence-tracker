/**
 * storage.js — Centralized LocalStorage Data Access Layer
 *
 * Isolates all persistence operations behind clean repository functions.
 * Future backend integration (Node.js / Express / SQL) can replace the
 * LocalStorage read/write internals here with REST API fetch() calls
 * without altering UI or calculation modules.
 */

const STORAGE_KEYS = {
  TRANSACTIONS: 'clearledger_transactions_v1',
  BUDGETS: 'clearledger_budgets_v1',
  INITIALIZED: 'clearledger_initialized_v1',
};

const DEFAULT_MONTHLY_BUDGET = 3500;

/**
 * Generates a unique identifier for new transaction records.
 * @returns {string}
 */
export function generateId() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return `tx_${crypto.randomUUID()}`;
  }
  return `tx_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

/**
 * Normalizes a transaction payload into the canonical schema.
 * @param {object} raw
 * @returns {object}
 */
export function normalizeTransaction(raw) {
  const type = raw && raw.type === 'income' ? 'income' : 'expense';
  const amount = Number(raw && raw.amount);

  return {
    id: raw && raw.id ? String(raw.id) : generateId(),
    title: raw && raw.title ? String(raw.title).trim() : 'Untitled Entry',
    amount: Number.isFinite(amount) && amount >= 0 ? Math.round(amount * 100) / 100 : 0,
    category: raw && raw.category ? String(raw.category).trim() : 'Other',
    type,
    date: raw && raw.date ? String(raw.date).slice(0, 10) : getTodayISO(),
    description: raw && raw.description ? String(raw.description).trim() : '',
  };
}

/**
 * Returns today's date formatted as YYYY-MM-DD in local time.
 * @returns {string}
 */
export function getTodayISO() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * Initial sample dataset seeded once on first visit.
 * @returns {Array<object>}
 */
function createSampleTransactions() {
  return [
    {
      id: 'tx_seed_01',
      title: 'Monthly Salary',
      amount: 5400,
      category: 'Salary',
      type: 'income',
      date: '2026-11-01',
      description: 'Primary payroll direct deposit',
    },
    {
      id: 'tx_seed_02',
      title: 'Apartment Rent',
      amount: 1650,
      category: 'Housing',
      type: 'expense',
      date: '2026-11-02',
      description: 'November lease payment',
    },
    {
      id: 'tx_seed_03',
      title: 'Electric & Fiber Internet',
      amount: 185.5,
      category: 'Utilities',
      type: 'expense',
      date: '2026-11-05',
      description: 'Monthly utility and broadband billing',
    },
    {
      id: 'tx_seed_04',
      title: 'UI Design Advisory',
      amount: 850,
      category: 'Freelance',
      type: 'income',
      date: '2026-11-07',
      description: 'Client product architecture review',
    },
    {
      id: 'tx_seed_05',
      title: 'Transit & Fuel Pass',
      amount: 142,
      category: 'Transport',
      type: 'expense',
      date: '2026-11-09',
      description: 'Commuter rail pass and fuel top-up',
    },
    {
      id: 'tx_seed_06',
      title: 'Dental Checkup',
      amount: 210,
      category: 'Healthcare',
      type: 'expense',
      date: '2026-11-10',
      description: 'Routine preventive cleaning',
    },
    {
      id: 'tx_seed_07',
      title: 'Grocery Shopping',
      amount: 462.5,
      category: 'Food',
      type: 'expense',
      date: '2026-11-13',
      description: 'Weekly groceries and household staples',
    },
    {
      id: 'tx_seed_08',
      title: 'Monthly Salary',
      amount: 5400,
      category: 'Salary',
      type: 'income',
      date: '2026-10-01',
      description: 'October payroll direct deposit',
    },
    {
      id: 'tx_seed_09',
      title: 'Apartment Rent',
      amount: 1650,
      category: 'Housing',
      type: 'expense',
      date: '2026-10-02',
      description: 'October lease payment',
    },
    {
      id: 'tx_seed_10',
      title: 'Groceries & Dining',
      amount: 590,
      category: 'Food',
      type: 'expense',
      date: '2026-10-14',
      description: 'Supermarket and team lunches',
    },
    {
      id: 'tx_seed_11',
      title: 'Autumn Jacket & Shoes',
      amount: 295,
      category: 'Shopping',
      type: 'expense',
      date: '2026-10-20',
      description: 'Seasonal wardrobe essentials',
    },
    {
      id: 'tx_seed_12',
      title: 'Monthly Salary',
      amount: 5400,
      category: 'Salary',
      type: 'income',
      date: '2026-09-01',
      description: 'September payroll direct deposit',
    },
    {
      id: 'tx_seed_13',
      title: 'Apartment Rent',
      amount: 1650,
      category: 'Housing',
      type: 'expense',
      date: '2026-09-02',
      description: 'September lease payment',
    },
    {
      id: 'tx_seed_14',
      title: 'Online Course Subscription',
      amount: 240,
      category: 'Education',
      type: 'expense',
      date: '2026-09-12',
      description: 'Annual technical workshop membership',
    },
    {
      id: 'tx_seed_15',
      title: 'Groceries & Market',
      amount: 520,
      category: 'Food',
      type: 'expense',
      date: '2026-09-18',
      description: 'Monthly produce and pantry',
    },
    {
      id: 'tx_seed_16',
      title: 'Monthly Salary',
      amount: 5200,
      category: 'Salary',
      type: 'income',
      date: '2026-08-01',
      description: 'August payroll direct deposit',
    },
    {
      id: 'tx_seed_17',
      title: 'Apartment Rent',
      amount: 1650,
      category: 'Housing',
      type: 'expense',
      date: '2026-08-02',
      description: 'August lease payment',
    },
    {
      id: 'tx_seed_18',
      title: 'Summer Concert & Cinema',
      amount: 180,
      category: 'Entertainment',
      type: 'expense',
      date: '2026-08-15',
      description: 'Weekend tickets and dinner',
    },
    {
      id: 'tx_seed_19',
      title: 'Monthly Salary',
      amount: 5200,
      category: 'Salary',
      type: 'income',
      date: '2026-07-01',
      description: 'July payroll direct deposit',
    },
    {
      id: 'tx_seed_20',
      title: 'Apartment Rent & Utilities',
      amount: 1830,
      category: 'Housing',
      type: 'expense',
      date: '2026-07-03',
      description: 'July housing and cooling bill',
    },
    {
      id: 'tx_seed_21',
      title: 'Monthly Salary',
      amount: 5200,
      category: 'Salary',
      type: 'income',
      date: '2026-06-01',
      description: 'June payroll direct deposit',
    },
    {
      id: 'tx_seed_22',
      title: 'Apartment Rent & Food',
      amount: 2120,
      category: 'Housing',
      type: 'expense',
      date: '2026-06-05',
      description: 'June housing and essentials',
    },
  ];
}

/**
 * Ensures LocalStorage is initialized cleanly on first load.
 */
export function initStorage() {
  try {
    const initialized = localStorage.getItem(STORAGE_KEYS.INITIALIZED);
    if (!initialized) {
      saveTransactions(createSampleTransactions());
      saveBudgetConfig({
        defaultAmount: DEFAULT_MONTHLY_BUDGET,
        monthlyOverrides: {},
      });
      localStorage.setItem(STORAGE_KEYS.INITIALIZED, 'true');
    }
  } catch (error) {
    console.error('Failed to initialize storage:', error);
  }
}

/**
 * Retrieves all transactions from LocalStorage.
 * @returns {Array<object>}
 */
export function getTransactions() {
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.TRANSACTIONS);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.map(normalizeTransaction);
  } catch (error) {
    console.error('Failed to read transactions from LocalStorage:', error);
    return [];
  }
}

/**
 * Retrieves a single transaction by ID.
 * @param {string} id
 * @returns {object|null}
 */
export function getTransactionById(id) {
  const transactions = getTransactions();
  return transactions.find((tx) => tx.id === id) || null;
}

/**
 * Persists the complete transactions array to LocalStorage.
 * @param {Array<object>} transactions
 * @returns {Array<object>}
 */
export function saveTransactions(transactions) {
  const normalized = Array.isArray(transactions)
    ? transactions.map(normalizeTransaction)
    : [];
  try {
    localStorage.setItem(STORAGE_KEYS.TRANSACTIONS, JSON.stringify(normalized));
  } catch (error) {
    console.error('Failed to save transactions to LocalStorage:', error);
    throw new Error('Unable to save transaction data to browser storage.');
  }
  return normalized;
}

/**
 * Creates and persists a new transaction.
 * @param {object} transactionInput
 * @returns {object}
 */
export function addTransaction(transactionInput) {
  const transactions = getTransactions();
  const created = normalizeTransaction({
    ...transactionInput,
    id: generateId(),
  });
  transactions.unshift(created);
  saveTransactions(transactions);
  return created;
}

/**
 * Updates an existing transaction by ID.
 * @param {string} id
 * @param {object} updates
 * @returns {object|null}
 */
export function updateTransaction(id, updates) {
  const transactions = getTransactions();
  const index = transactions.findIndex((tx) => tx.id === id);
  if (index === -1) return null;

  const updated = normalizeTransaction({
    ...transactions[index],
    ...updates,
    id,
  });

  transactions[index] = updated;
  saveTransactions(transactions);
  return updated;
}

/**
 * Deletes a transaction by ID.
 * @param {string} id
 * @returns {boolean}
 */
export function deleteTransaction(id) {
  const transactions = getTransactions();
  const filtered = transactions.filter((tx) => tx.id !== id);
  if (filtered.length === transactions.length) {
    return false;
  }
  saveTransactions(filtered);
  return true;
}

/**
 * Retrieves the full budget configuration object.
 * @returns {{ defaultAmount: number, monthlyOverrides: Record<string, number> }}
 */
export function getBudgetConfig() {
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.BUDGETS);
    if (!raw) {
      return { defaultAmount: DEFAULT_MONTHLY_BUDGET, monthlyOverrides: {} };
    }
    const parsed = JSON.parse(raw);
    return {
      defaultAmount:
        Number.isFinite(Number(parsed.defaultAmount)) && Number(parsed.defaultAmount) > 0
          ? Number(parsed.defaultAmount)
          : 0,
      monthlyOverrides:
        parsed.monthlyOverrides && typeof parsed.monthlyOverrides === 'object'
          ? parsed.monthlyOverrides
          : {},
    };
  } catch (error) {
    console.error('Failed to read budget config:', error);
    return { defaultAmount: DEFAULT_MONTHLY_BUDGET, monthlyOverrides: {} };
  }
}

/**
 * Persists the budget configuration object.
 * @param {{ defaultAmount: number, monthlyOverrides: Record<string, number> }} config
 */
export function saveBudgetConfig(config) {
  try {
    localStorage.setItem(STORAGE_KEYS.BUDGETS, JSON.stringify(config));
  } catch (error) {
    console.error('Failed to save budget config:', error);
    throw new Error('Unable to save budget settings to browser storage.');
  }
}

/**
 * Returns the budget amount configured for a specific YYYY-MM month.
 * @param {string} monthKey
 * @returns {number}
 */
export function getBudgetForMonth(monthKey) {
  const config = getBudgetConfig();
  if (
    monthKey &&
    Object.prototype.hasOwnProperty.call(config.monthlyOverrides, monthKey)
  ) {
    const override = Number(config.monthlyOverrides[monthKey]);
    return Number.isFinite(override) && override > 0 ? override : 0;
  }
  return config.defaultAmount || 0;
}

/**
 * Saves the budget amount for a specific month (and optionally updates the default).
 * @param {string} monthKey
 * @param {number} amount
 * @param {boolean} applyAsDefault
 */
export function saveBudget(monthKey, amount, applyAsDefault = true) {
  const cleanAmount = Math.round(Number(amount) * 100) / 100;
  const config = getBudgetConfig();

  if (monthKey) {
    config.monthlyOverrides[monthKey] = cleanAmount;
  }
  if (applyAsDefault) {
    config.defaultAmount = cleanAmount;
  }

  saveBudgetConfig(config);
  return cleanAmount;
}

/**
 * Restores the sample dataset and default budget.
 */
export function resetToSampleData() {
  saveTransactions(createSampleTransactions());
  saveBudgetConfig({
    defaultAmount: DEFAULT_MONTHLY_BUDGET,
    monthlyOverrides: {},
  });
  localStorage.setItem(STORAGE_KEYS.INITIALIZED, 'true');
}

/**
 * Clears all transactions and resets monthly overrides.
 */
export function clearAllData() {
  saveTransactions([]);
  saveBudgetConfig({
    defaultAmount: 0,
    monthlyOverrides: {},
  });
  localStorage.setItem(STORAGE_KEYS.INITIALIZED, 'true');
}
