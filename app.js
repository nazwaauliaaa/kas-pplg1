import {
  STORAGE_KEY,
  createInitialState,
  normalizeState,
  calculateSummary,
  togglePayment,
  addStudentsBulk,
  updateStudent,
  deleteStudent,
  addWeek,
  deleteWeek,
  addExtraIncome,
  deleteExtraIncome,
  addExpense,
  deleteExpense,
  formatRupiah,
  verifyTreasurerPassword,
} from './kas-logic.js';
import { createSharedSync } from './cloud-sync.js';

let state = loadState();
let currentFilter = 'all';
let searchQuery = '';
let toastTimer = null;
let isTreasurerUnlocked = false;
let activeTreasurerPassword = '';
let pendingAuthTarget = null;
let cloudSync = null;

// Elements
const classNameHeading = document.getElementById('classNameHeading');
const treasurerModeBtn = document.getElementById('treasurerModeBtn');
const treasurerModeLabel = document.getElementById('treasurerModeLabel');
const syncStatusText = document.getElementById('syncStatusText');
const viewOnlyNotice = document.getElementById('viewOnlyNotice');
const totalBalanceEl = document.getElementById('totalBalance');
const totalIncomeEl = document.getElementById('totalIncome');
const totalExpenseEl = document.getElementById('totalExpense');

const weekSelect = document.getElementById('weekSelect');
const prevWeekBtn = document.getElementById('prevWeekBtn');
const nextWeekBtn = document.getElementById('nextWeekBtn');
const deleteWeekQuickBtn = document.getElementById('deleteWeekQuickBtn');
const openNewWeekBtn = document.getElementById('openNewWeekBtn');
const activeWeekMetaEl = document.getElementById('activeWeekMeta');
const weekProgressTextEl = document.getElementById('weekProgressText');
const weekIncomeTextEl = document.getElementById('weekIncomeText');
const weekProgressBarEl = document.getElementById('weekProgressBar');

const searchStudentInput = document.getElementById('searchStudentInput');
const filterButtons = document.querySelectorAll('.filter-pills .pill');
const checklistContainer = document.getElementById('checklistContainer');

const incomeForm = document.getElementById('incomeForm');
const incomeTitleInput = document.getElementById('incomeTitle');
const incomeAmountInput = document.getElementById('incomeAmount');
const incomeDateInput = document.getElementById('incomeDate');
const incomesList = document.getElementById('incomesList');

const expenseForm = document.getElementById('expenseForm');
const expenseTitleInput = document.getElementById('expenseTitle');
const expenseAmountInput = document.getElementById('expenseAmount');
const expenseDateInput = document.getElementById('expenseDate');
const expensesList = document.getElementById('expensesList');

const addStudentsForm = document.getElementById('addStudentsForm');
const bulkStudentsInput = document.getElementById('bulkStudentsInput');
const studentCountLabel = document.getElementById('studentCountLabel');
const studentsManageList = document.getElementById('studentsManageList');

const settingsForm = document.getElementById('settingsForm');
const classNameInput = document.getElementById('classNameInput');
const defaultFeeInput = document.getElementById('defaultFeeInput');
const deleteActiveWeekBtn = document.getElementById('deleteActiveWeekBtn');

const navButtons = document.querySelectorAll('.nav-btn');
const tabPanels = document.querySelectorAll('.tab-panel');

const newWeekModal = document.getElementById('newWeekModal');
const newWeekForm = document.getElementById('newWeekForm');
const newWeekLabelInput = document.getElementById('newWeekLabel');
const newWeekDateInput = document.getElementById('newWeekDate');
const cancelNewWeekBtn = document.getElementById('cancelNewWeekBtn');
const treasurerLockIcons = document.querySelectorAll('.treasurer-lock-icon');
const lockTreasurerButtons = document.querySelectorAll('.lock-treasurer-btn');
const treasurerAuthModal = document.getElementById('treasurerAuthModal');
const treasurerAuthForm = document.getElementById('treasurerAuthForm');
const treasurerPasswordInput = document.getElementById('treasurerPasswordInput');
const treasurerAuthError = document.getElementById('treasurerAuthError');
const cancelTreasurerAuthBtn = document.getElementById('cancelTreasurerAuthBtn');
const toastEl = document.getElementById('toast');

function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      const initial = createInitialState();
      localStorage.setItem(STORAGE_KEY, JSON.stringify(initial));
      return initial;
    }
    const parsed = JSON.parse(raw);
    const normalized = normalizeState(parsed);
    if (!Array.isArray(parsed?.extraIncomes)) {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(normalized));
    }
    return normalized;
  } catch {
    return createInitialState();
  }
}

function persistLocal(nextState) {
  state = nextState;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    showToast('Gagal menyimpan ke memori HP');
  }
}

function saveLocalAndRender(nextState) {
  persistLocal(nextState);
  render();
}

function saveAndRender(nextState) {
  persistLocal(nextState);
  render();
  if (cloudSync?.enabled) {
    cloudSync.pushState(state, activeTreasurerPassword);
  }
}

function showToast(message) {
  toastEl.textContent = message;
  toastEl.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    toastEl.classList.remove('show');
  }, 2200);
}

function render() {
  const summary = calculateSummary(state);
  const activeWeek = summary.activeWeek;

  // Header
  classNameHeading.textContent = state.className;
  totalBalanceEl.textContent = formatRupiah(summary.balance);
  totalIncomeEl.textContent = formatRupiah(summary.totalIncome);
  totalExpenseEl.textContent = formatRupiah(summary.totalExpense);

  // Week selector
  weekSelect.innerHTML = '';
  state.weeks.forEach((week) => {
    const option = document.createElement('option');
    option.value = week.id;
    option.textContent = week.label;
    option.selected = week.id === state.activeWeekId;
    weekSelect.appendChild(option);
  });

  const activeIdx = state.weeks.findIndex((w) => w.id === state.activeWeekId);
  prevWeekBtn.disabled = activeIdx <= 0;
  nextWeekBtn.disabled = activeIdx === -1 || activeIdx >= state.weeks.length - 1;

  activeWeekMetaEl.textContent = `${activeWeek?.dateLabel || '-'} • ${formatRupiah(summary.activeWeekFee)}/anak`;
  weekProgressTextEl.textContent = `${summary.activeWeekPaidCount} / ${summary.totalStudents} siswa lunas`;
  weekIncomeTextEl.textContent = formatRupiah(summary.activeWeekIncome);
  const pct =
    summary.totalStudents > 0
      ? Math.round((summary.activeWeekPaidCount / summary.totalStudents) * 100)
      : 0;
  weekProgressBarEl.style.width = `${pct}%`;

  renderChecklist(activeWeek, summary.activeWeekFee);
  renderIncomes();
  renderExpenses();
  renderStudentsManage();

  // Settings & quick week delete values
  classNameInput.value = state.className;
  defaultFeeInput.value = String(state.defaultFee);
  const canDeleteWeek = state.weeks.length > 1;
  deleteActiveWeekBtn.disabled = !canDeleteWeek;
  deleteWeekQuickBtn.disabled = !canDeleteWeek;
}

function renderChecklist(activeWeek, weekFee) {
  checklistContainer.innerHTML = '';

  if (state.students.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'empty-state';
    empty.textContent = 'Belum ada daftar siswa. Tambahkan siswa di menu "Siswa & Data".';
    checklistContainer.appendChild(empty);
    return;
  }

  const query = searchQuery.trim().toLowerCase();
  const filtered = state.students.filter((student) => {
    const isPaid = Boolean(activeWeek?.payments?.[student.id]?.paid);
    if (currentFilter === 'paid' && !isPaid) return false;
    if (currentFilter === 'unpaid' && isPaid) return false;
    if (query && !student.name.toLowerCase().includes(query)) return false;
    return true;
  });

  if (filtered.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'empty-state';
    empty.textContent = 'Tidak ada siswa yang sesuai filter.';
    checklistContainer.appendChild(empty);
    return;
  }

  for (const student of filtered) {
    const payment = activeWeek?.payments?.[student.id];
    const isPaid = Boolean(payment?.paid);

    const row = document.createElement('div');
    row.className = `student-row${isPaid ? ' paid' : ''}${isTreasurerUnlocked ? '' : ' readonly'}`;
    row.setAttribute('role', 'checkbox');
    row.setAttribute('aria-checked', String(isPaid));
    row.setAttribute('aria-disabled', String(!isTreasurerUnlocked));
    row.tabIndex = 0;

    const info = document.createElement('div');
    info.className = 'student-info';

    const num = document.createElement('span');
    num.className = 'student-num';
    num.textContent = String(student.number);

    const textWrap = document.createElement('div');
    const nameEl = document.createElement('div');
    nameEl.className = 'student-name';
    nameEl.textContent = student.name;

    const subEl = document.createElement('div');
    subEl.className = 'student-sub';
    subEl.textContent = isPaid ? `Lunas • +${formatRupiah(weekFee)}` : `Belum bayar • ${formatRupiah(weekFee)}`;

    textWrap.appendChild(nameEl);
    textWrap.appendChild(subEl);
    info.appendChild(num);
    info.appendChild(textWrap);

    const checkbox = document.createElement('div');
    checkbox.className = 'check-box';
    checkbox.textContent = isPaid ? '✓' : '';

    row.appendChild(info);
    row.appendChild(checkbox);

    const handleToggle = () => {
      if (!isTreasurerUnlocked) {
        showToast('Mode Lihat: ketuk "Bendahara" di atas untuk mengedit');
        return;
      }
      const next = togglePayment(state, activeWeek.id, student.id);
      const nowPaid = Boolean(
        next.weeks.find((w) => w.id === activeWeek.id)?.payments?.[student.id]?.paid
      );
      saveAndRender(next);
      showToast(
        nowPaid
          ? `${student.name} lunas (+${formatRupiah(weekFee)})`
          : `Ceklis ${student.name} dibatalkan (-${formatRupiah(weekFee)})`
      );
    };

    row.addEventListener('click', handleToggle);
    row.addEventListener('keydown', (e) => {
      if (e.key === ' ' || e.key === 'Enter') {
        e.preventDefault();
        handleToggle();
      }
    });

    checklistContainer.appendChild(row);
  }
}

function renderLedgerList(container, items, { emptyText, amountSign, confirmPrefix, onDelete }) {
  container.innerHTML = '';

  if (items.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'empty-state';
    empty.textContent = emptyText;
    container.appendChild(empty);
    return;
  }

  for (const entry of items) {
    const item = document.createElement('div');
    item.className = 'list-item';

    const main = document.createElement('div');
    main.className = 'list-item-main';

    const title = document.createElement('div');
    title.className = 'list-item-title';
    title.textContent = entry.title;

    const sub = document.createElement('div');
    sub.className = 'list-item-sub';
    sub.textContent = `${entry.date} • ${amountSign}${formatRupiah(entry.amount)}`;

    main.appendChild(title);
    main.appendChild(sub);

    const actions = document.createElement('div');
    actions.className = 'item-actions';

    const delBtn = document.createElement('button');
    delBtn.type = 'button';
    delBtn.className = 'btn-mini danger';
    delBtn.textContent = 'Hapus';
    delBtn.addEventListener('click', () => {
      if (confirm(`Hapus ${confirmPrefix} "${entry.title}"?`)) {
        onDelete(entry.id);
      }
    });

    actions.appendChild(delBtn);
    item.appendChild(main);
    item.appendChild(actions);
    container.appendChild(item);
  }
}

function renderIncomes() {
  renderLedgerList(incomesList, state.extraIncomes || [], {
    emptyText: 'Belum ada pemasukan lainnya yang dicatat.',
    amountSign: '+',
    confirmPrefix: 'pemasukan',
    onDelete: (id) => {
      saveAndRender(deleteExtraIncome(state, id));
      showToast('Pemasukan dihapus');
    },
  });
}

function renderExpenses() {
  renderLedgerList(expensesList, state.expenses, {
    emptyText: 'Belum ada pengeluaran kas yang dicatat.',
    amountSign: '-',
    confirmPrefix: 'pengeluaran',
    onDelete: (id) => {
      saveAndRender(deleteExpense(state, id));
      showToast('Pengeluaran dihapus');
    },
  });
}

function renderStudentsManage() {
  studentCountLabel.textContent = String(state.students.length);
  studentsManageList.innerHTML = '';

  if (state.students.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'empty-state';
    empty.textContent = 'Daftar siswa masih kosong.';
    studentsManageList.appendChild(empty);
    return;
  }

  for (const student of state.students) {
    const item = document.createElement('div');
    item.className = 'list-item';

    const main = document.createElement('div');
    main.className = 'list-item-main';

    const title = document.createElement('div');
    title.className = 'list-item-title';
    title.textContent = `${student.number}. ${student.name}`;

    main.appendChild(title);

    const actions = document.createElement('div');
    actions.className = 'item-actions';

    const editBtn = document.createElement('button');
    editBtn.type = 'button';
    editBtn.className = 'btn-mini';
    editBtn.textContent = 'Edit';
    editBtn.addEventListener('click', () => {
      const nextName = prompt('Ubah nama siswa:', student.name);
      if (nextName && nextName.trim()) {
        saveAndRender(updateStudent(state, student.id, { name: nextName, number: student.number }));
        showToast('Nama siswa diperbarui');
      }
    });

    const delBtn = document.createElement('button');
    delBtn.type = 'button';
    delBtn.className = 'btn-mini danger';
    delBtn.textContent = 'Hapus';
    delBtn.addEventListener('click', () => {
      if (confirm(`Hapus ${student.name}? Catatan bayarnya juga akan terhapus.`)) {
        saveAndRender(deleteStudent(state, student.id));
        showToast(`${student.name} dihapus`);
      }
    });

    actions.appendChild(editBtn);
    actions.appendChild(delBtn);
    item.appendChild(main);
    item.appendChild(actions);
    studentsManageList.appendChild(item);
  }
}

function switchTab(target) {
  navButtons.forEach((b) => b.classList.toggle('active', b.dataset.tab === target));
  tabPanels.forEach((panel) => panel.classList.toggle('active', panel.id === target));
}

const LOCKED_ICON_SVG = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="4" y="11" width="16" height="10" rx="2.5"></rect><path d="M8 11V7a4 4 0 0 1 8 0v4"></path></svg>`;
const UNLOCKED_ICON_SVG = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="4" y="11" width="16" height="10" rx="2.5"></rect><path d="M8 11V7a4 4 0 0 1 7.6-1.7"></path></svg>`;

function updateTreasurerLockUI() {
  const iconSvg = isTreasurerUnlocked ? UNLOCKED_ICON_SVG : LOCKED_ICON_SVG;
  treasurerLockIcons.forEach((iconEl) => {
    iconEl.innerHTML = iconSvg;
  });
  treasurerModeBtn.classList.toggle('unlocked', isTreasurerUnlocked);
  treasurerModeLabel.textContent = isTreasurerUnlocked ? 'Kunci' : 'Bendahara';
  viewOnlyNotice.classList.toggle('hidden', isTreasurerUnlocked);
}

function openTreasurerAuth(target = null) {
  pendingAuthTarget = target;
  treasurerPasswordInput.value = '';
  treasurerAuthError.textContent = '';
  treasurerAuthError.classList.add('hidden');
  treasurerAuthModal.showModal();
  setTimeout(() => treasurerPasswordInput.focus(), 50);
}

function lockTreasurerMode() {
  isTreasurerUnlocked = false;
  activeTreasurerPassword = '';
  updateTreasurerLockUI();
  switchTab('tabChecklist');
  render();
  showToast('Mode Bendahara dikunci (Mode Lihat)');
}

function openNewWeekDialog() {
  newWeekLabelInput.value = `Minggu ${state.weeks.length + 1}`;
  newWeekDateInput.value = new Date().toISOString().slice(0, 10);
  newWeekModal.showModal();
}

// Navigation tabs
const PROTECTED_TABS = new Set(['tabIncomes', 'tabExpenses', 'tabSettings']);

navButtons.forEach((btn) => {
  btn.addEventListener('click', () => {
    const target = btn.dataset.tab;
    if (PROTECTED_TABS.has(target) && !isTreasurerUnlocked) {
      openTreasurerAuth({ type: 'tab', tab: target });
      return;
    }
    switchTab(target);
  });
});

treasurerModeBtn.addEventListener('click', () => {
  if (isTreasurerUnlocked) {
    lockTreasurerMode();
  } else {
    openTreasurerAuth(null);
  }
});

treasurerAuthForm.addEventListener('submit', (e) => {
  e.preventDefault();
  const enteredPassword = treasurerPasswordInput.value;
  if (verifyTreasurerPassword(enteredPassword)) {
    isTreasurerUnlocked = true;
    activeTreasurerPassword = enteredPassword;
    updateTreasurerLockUI();
    treasurerAuthModal.close();
    if (cloudSync?.enabled && !cloudSync.hasRemoteDoc()) {
      cloudSync.pushState(state, activeTreasurerPassword);
    }
    const target = pendingAuthTarget;
    pendingAuthTarget = null;
    if (target?.type === 'tab') {
      switchTab(target.tab);
    } else if (target?.type === 'newWeek') {
      openNewWeekDialog();
    } else if (target?.type === 'deleteWeek') {
      handleDeleteActiveWeek();
    }
    render();
    showToast('Mode Bendahara aktif');
  } else {
    treasurerAuthError.textContent = 'Password salah. Hanya bendahara yang bisa mengedit.';
    treasurerAuthError.classList.remove('hidden');
    treasurerPasswordInput.select();
  }
});

cancelTreasurerAuthBtn.addEventListener('click', () => {
  pendingAuthTarget = null;
  treasurerAuthModal.close();
});

lockTreasurerButtons.forEach((btn) => {
  btn.addEventListener('click', lockTreasurerMode);
});

// Week switching (local viewing only)
weekSelect.addEventListener('change', (e) => {
  saveLocalAndRender({ ...state, activeWeekId: e.target.value });
});

prevWeekBtn.addEventListener('click', () => {
  const idx = state.weeks.findIndex((w) => w.id === state.activeWeekId);
  if (idx > 0) {
    saveLocalAndRender({ ...state, activeWeekId: state.weeks[idx - 1].id });
  }
});

nextWeekBtn.addEventListener('click', () => {
  const idx = state.weeks.findIndex((w) => w.id === state.activeWeekId);
  if (idx >= 0 && idx < state.weeks.length - 1) {
    saveLocalAndRender({ ...state, activeWeekId: state.weeks[idx + 1].id });
  }
});

// New & Delete week
function handleDeleteActiveWeek() {
  if (state.weeks.length <= 1) return;
  if (!isTreasurerUnlocked) {
    openTreasurerAuth({ type: 'deleteWeek' });
    return;
  }
  const activeWeek = state.weeks.find((w) => w.id === state.activeWeekId);
  if (confirm(`Hapus periode "${activeWeek?.label}"?`)) {
    saveAndRender(deleteWeek(state, state.activeWeekId));
    showToast('Periode minggu dihapus');
  }
}

deleteWeekQuickBtn.addEventListener('click', handleDeleteActiveWeek);

openNewWeekBtn.addEventListener('click', () => {
  if (!isTreasurerUnlocked) {
    openTreasurerAuth({ type: 'newWeek' });
    return;
  }
  openNewWeekDialog();
});

cancelNewWeekBtn.addEventListener('click', () => {
  newWeekModal.close();
});

newWeekForm.addEventListener('submit', (e) => {
  e.preventDefault();
  const next = addWeek(state, newWeekLabelInput.value, newWeekDateInput.value);
  newWeekModal.close();
  saveAndRender(next);
  showToast('Periode minggu baru dibuat');
});

// Filter & search
searchStudentInput.addEventListener('input', (e) => {
  searchQuery = e.target.value;
  render();
});

filterButtons.forEach((btn) => {
  btn.addEventListener('click', () => {
    currentFilter = btn.dataset.filter;
    filterButtons.forEach((b) => b.classList.toggle('active', b === btn));
    render();
  });
});

function bindLedgerForm(form, titleInput, amountInput, dateInput, addFn, toastMessage) {
  dateInput.value = new Date().toISOString().slice(0, 10);
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const next = addFn(state, {
      title: titleInput.value,
      amount: amountInput.value,
      date: dateInput.value,
    });
    form.reset();
    dateInput.value = new Date().toISOString().slice(0, 10);
    saveAndRender(next);
    showToast(toastMessage);
  });
}

// Extra Incomes & Expenses
bindLedgerForm(
  incomeForm,
  incomeTitleInput,
  incomeAmountInput,
  incomeDateInput,
  addExtraIncome,
  'Pemasukan disimpan'
);
bindLedgerForm(
  expenseForm,
  expenseTitleInput,
  expenseAmountInput,
  expenseDateInput,
  addExpense,
  'Pengeluaran disimpan'
);

// Students bulk add
addStudentsForm.addEventListener('submit', (e) => {
  e.preventDefault();
  const before = state.students.length;
  const next = addStudentsBulk(state, bulkStudentsInput.value);
  const added = next.students.length - before;
  if (added > 0) {
    bulkStudentsInput.value = '';
    saveAndRender(next);
    showToast(`${added} siswa ditambahkan`);
  }
});

// Settings
settingsForm.addEventListener('submit', (e) => {
  e.preventDefault();
  const nextFee = Math.round(Number(defaultFeeInput.value));
  const nextClassName = classNameInput.value.trim() || 'Kas Kelas';
  if (!Number.isFinite(nextFee) || nextFee < 500) {
    showToast('Nominal minimal Rp500');
    return;
  }

  // Also update active week fee if it currently has no payments yet
  const activeWeek = state.weeks.find((w) => w.id === state.activeWeekId);
  const activeHasPayments = activeWeek && Object.keys(activeWeek.payments || {}).length > 0;
  const weeks = state.weeks.map((w) =>
    w.id === state.activeWeekId && !activeHasPayments ? { ...w, fee: nextFee } : w
  );

  saveAndRender({
    ...state,
    className: nextClassName,
    defaultFee: nextFee,
    weeks,
  });
  showToast('Pengaturan disimpan');
});

deleteActiveWeekBtn.addEventListener('click', handleDeleteActiveWeek);

// Cloud Sync (Netlify Database / Firebase Firestore)
const SYNC_STATUS_LABELS = {
  local: '• Lokal',
  connecting: '• Menghubungkan...',
  uninitialized: '• Siap Sync',
  saving: '• Menyimpan...',
  synced: '• Live Sync',
  offline: '• Offline',
  'auth-error': '• Password Ditolak',
};

async function initCloudSync() {
  cloudSync = await createSharedSync({
    onStatusChange: (status) => {
      syncStatusText.textContent = SYNC_STATUS_LABELS[status] || '';
    },
    onRemoteState: (remoteState) => {
      const currentViewedWeekId = state.activeWeekId;
      const keepViewedWeek = remoteState.weeks.some((w) => w.id === currentViewedWeekId);
      const merged = keepViewedWeek
        ? { ...remoteState, activeWeekId: currentViewedWeekId }
        : remoteState;
      saveLocalAndRender(merged);
    },
  });
}

// Register PWA Service Worker
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js').catch(() => {});
  });
}

updateTreasurerLockUI();
render();
initCloudSync();

