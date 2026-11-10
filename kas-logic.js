export const DEFAULT_FEE = 2000;
export const STORAGE_KEY = 'kas_kelas_data_v2';

export const DEFAULT_STUDENTS = [
  'Abdul Mughni',
  'Adam Al Rizky',
  'Ahmad Saiful',
  'Alvin Rasya',
  'Arka Hadi',
  'Arya Zardan',
  'Azman Nur',
  'Dava Shalehillabi',
  'Deriyana',
  'Dzan Bagas',
  'Ervan Fadilah',
  'Fadilah Maulana',
  'Galang Yusuf',
  'Gina Febriani',
  'Ikhsan Nurohman',
  'Jhoni Yustiano',
  'Leftyan Hamidi',
  'Maulana Al Fandi',
  'M. Farel Agna',
  'M. Rasha Aldiansyah',
  'M. Raffi Kustian',
  'Mubarokah Denis',
  'M. Iqbal Putra',
  'M. Rizki',
  'Nazwa Aulia',
  'Novita Putri',
  'Rafi Muhammad',
  'Ramadhan Bangkit',
  'Risky Nurofiq',
  'Rommy Bima',
  'Salsa Nuraeni',
  'Siti Asti Nurjanah',
  'Siti Nurfadila',
  'Siti Rofiah',
  'Sultan Surya',
  'Triswal Wildan',
  'Valdis Anhar',
  'Wulan Nurhasanah',
  'Zakiyy Adira',
  'Zulfikar Ramdhani',
];

/**
 * Generates a compact unique ID with an optional prefix.
 */
export function createId(prefix = 'id') {
  const rand = Math.random().toString(36).slice(2, 7);
  return `${prefix}_${Date.now().toString(36)}_${rand}`;
}

/**
 * Formats an integer amount into Indonesian Rupiah (e.g. "Rp2.000").
 */
export function formatRupiah(amount) {
  const safeAmount = Number.isFinite(amount) ? Math.round(amount) : 0;
  const sign = safeAmount < 0 ? '-' : '';
  const absFormatted = Math.abs(safeAmount).toLocaleString('id-ID');
  return `${sign}Rp${absFormatted}`;
}

/**
 * Creates the initial state with the class student roster and Week 1 ready to use.
 */
export function createInitialState() {
  const students = DEFAULT_STUDENTS.map((name, idx) => ({
    id: `stu_${idx + 1}`,
    number: idx + 1,
    name,
  }));

  const week1 = {
    id: 'week_1',
    label: 'Minggu 1',
    dateLabel: new Date().toISOString().slice(0, 10),
    fee: DEFAULT_FEE,
    payments: {},
  };

  return {
    version: 2,
    className: 'Kas PPLG 1',
    defaultFee: DEFAULT_FEE,
    students,
    weeks: [week1],
    activeWeekId: week1.id,
    expenses: [],
  };
}

/**
 * Normalizes and validates loaded state so missing fields never crash the UI.
 */
export function normalizeState(raw) {
  if (!raw || typeof raw !== 'object') {
    return createInitialState();
  }

  const defaultFee =
    Number.isFinite(Number(raw.defaultFee)) && Number(raw.defaultFee) > 0
      ? Math.round(Number(raw.defaultFee))
      : DEFAULT_FEE;

  const students = Array.isArray(raw.students)
    ? raw.students
        .filter((s) => s && typeof s.id === 'string' && typeof s.name === 'string' && s.name.trim())
        .map((s, idx) => ({
          id: s.id,
          number: Number.isFinite(Number(s.number)) ? Number(s.number) : idx + 1,
          name: s.name.trim(),
        }))
    : [];

  let weeks = Array.isArray(raw.weeks)
    ? raw.weeks
        .filter((w) => w && typeof w.id === 'string' && typeof w.label === 'string')
        .map((w, idx) => ({
          id: w.id,
          label: w.label.trim() || `Minggu ${idx + 1}`,
          dateLabel: typeof w.dateLabel === 'string' ? w.dateLabel : '',
          fee:
            Number.isFinite(Number(w.fee)) && Number(w.fee) > 0
              ? Math.round(Number(w.fee))
              : defaultFee,
          payments: w.payments && typeof w.payments === 'object' ? { ...w.payments } : {},
        }))
    : [];

  if (weeks.length === 0) {
    weeks = [
      {
        id: createId('week'),
        label: 'Minggu 1',
        dateLabel: new Date().toISOString().slice(0, 10),
        fee: defaultFee,
        payments: {},
      },
    ];
  }

  const activeWeekExists = weeks.some((w) => w.id === raw.activeWeekId);
  const activeWeekId = activeWeekExists ? raw.activeWeekId : weeks[weeks.length - 1].id;

  const expenses = Array.isArray(raw.expenses)
    ? raw.expenses
        .filter(
          (e) =>
            e &&
            typeof e.id === 'string' &&
            typeof e.title === 'string' &&
            Number.isFinite(Number(e.amount)) &&
            Number(e.amount) > 0
        )
        .map((e) => ({
          id: e.id,
          title: e.title.trim(),
          amount: Math.round(Number(e.amount)),
          date: typeof e.date === 'string' ? e.date : new Date().toISOString().slice(0, 10),
        }))
    : [];

  return {
    version: 1,
    className:
      typeof raw.className === 'string' && raw.className.trim()
        ? raw.className.trim()
        : 'Kas Kelas',
    defaultFee,
    students,
    weeks,
    activeWeekId,
    expenses,
  };
}

/**
 * Computes total income across all weeks, total expenses, net balance,
 * and active week summary.
 */
export function calculateSummary(state) {
  const studentIds = new Set(state.students.map((s) => s.id));
  let totalIncome = 0;

  for (const week of state.weeks) {
    const weekFee = week.fee || state.defaultFee || DEFAULT_FEE;
    const payments = week.payments || {};
    for (const studentId of Object.keys(payments)) {
      if (studentIds.has(studentId) && payments[studentId]?.paid) {
        totalIncome += weekFee;
      }
    }
  }

  const totalExpense = state.expenses.reduce((sum, exp) => sum + (exp.amount || 0), 0);
  const balance = totalIncome - totalExpense;

  const activeWeek = state.weeks.find((w) => w.id === state.activeWeekId) || state.weeks[0];
  let activeWeekPaidCount = 0;
  if (activeWeek) {
    for (const student of state.students) {
      if (activeWeek.payments?.[student.id]?.paid) {
        activeWeekPaidCount += 1;
      }
    }
  }

  const activeWeekFee = activeWeek ? activeWeek.fee || state.defaultFee : state.defaultFee;
  const activeWeekIncome = activeWeekPaidCount * activeWeekFee;
  const totalStudents = state.students.length;
  const activeWeekTarget = totalStudents * activeWeekFee;

  return {
    totalIncome,
    totalExpense,
    balance,
    activeWeek,
    activeWeekFee,
    activeWeekPaidCount,
    totalStudents,
    activeWeekIncome,
    activeWeekTarget,
  };
}

/**
 * Toggles a student's payment status for the given week.
 */
export function togglePayment(state, weekId, studentId) {
  const nextWeeks = state.weeks.map((week) => {
    if (week.id !== weekId) return week;
    const current = week.payments?.[studentId];
    const nextPayments = { ...(week.payments || {}) };

    if (current?.paid) {
      delete nextPayments[studentId];
    } else {
      nextPayments[studentId] = {
        paid: true,
        paidAt: new Date().toISOString(),
      };
    }

    return {
      ...week,
      payments: nextPayments,
    };
  });

  return {
    ...state,
    weeks: nextWeeks,
  };
}

/**
 * Adds one or multiple students from newline-separated text.
 */
export function addStudentsBulk(state, rawText) {
  const lines = String(rawText || '')
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  if (lines.length === 0) {
    return state;
  }

  let nextNumber =
    state.students.reduce((max, s) => Math.max(max, Number(s.number) || 0), 0) + 1;

  const newStudents = lines.map((name) => ({
    id: createId('stu'),
    number: nextNumber++,
    name,
  }));

  return {
    ...state,
    students: [...state.students, ...newStudents],
  };
}

/**
 * Updates an existing student's name/number.
 */
export function updateStudent(state, studentId, { name, number }) {
  const trimmed = String(name || '').trim();
  if (!trimmed) return state;

  return {
    ...state,
    students: state.students.map((s) =>
      s.id === studentId
        ? {
            ...s,
            name: trimmed,
            number: Number.isFinite(Number(number)) && Number(number) > 0 ? Number(number) : s.number,
          }
        : s
    ),
  };
}

/**
 * Deletes a student and cleans up their payment entries across weeks.
 */
export function deleteStudent(state, studentId) {
  const students = state.students.filter((s) => s.id !== studentId);
  const weeks = state.weeks.map((week) => {
    if (!week.payments || !(studentId in week.payments)) {
      return week;
    }
    const nextPayments = { ...week.payments };
    delete nextPayments[studentId];
    return { ...week, payments: nextPayments };
  });

  return {
    ...state,
    students,
    weeks,
  };
}

/**
 * Creates a new weekly period and selects it as active.
 */
export function addWeek(state, labelInput = '', dateLabelInput = '') {
  const nextIndex = state.weeks.length + 1;
  const label = String(labelInput || '').trim() || `Minggu ${nextIndex}`;
  const dateLabel = String(dateLabelInput || '').trim() || new Date().toISOString().slice(0, 10);

  const newWeek = {
    id: createId('week'),
    label,
    dateLabel,
    fee: state.defaultFee || DEFAULT_FEE,
    payments: {},
  };

  return {
    ...state,
    weeks: [...state.weeks, newWeek],
    activeWeekId: newWeek.id,
  };
}

/**
 * Deletes a weekly period if more than one week exists.
 */
export function deleteWeek(state, weekId) {
  if (state.weeks.length <= 1) {
    return state;
  }
  const weeks = state.weeks.filter((w) => w.id !== weekId);
  const activeWeekId =
    state.activeWeekId === weekId ? weeks[weeks.length - 1].id : state.activeWeekId;

  return {
    ...state,
    weeks,
    activeWeekId,
  };
}

/**
 * Adds an expense item.
 */
export function addExpense(state, { title, amount, date }) {
  const cleanTitle = String(title || '').trim();
  const cleanAmount = Math.round(Number(amount));
  if (!cleanTitle || !Number.isFinite(cleanAmount) || cleanAmount <= 0) {
    return state;
  }

  const expense = {
    id: createId('exp'),
    title: cleanTitle,
    amount: cleanAmount,
    date: String(date || '').trim() || new Date().toISOString().slice(0, 10),
  };

  return {
    ...state,
    expenses: [expense, ...state.expenses],
  };
}

/**
 * Deletes an expense item.
 */
export function deleteExpense(state, expenseId) {
  return {
    ...state,
    expenses: state.expenses.filter((e) => e.id !== expenseId),
  };
}

/**
 * Formats a WhatsApp-friendly report for the active week and total balance.
 */
export function buildWhatsAppReport(state) {
  const summary = calculateSummary(state);
  const week = summary.activeWeek;
  const paidNames = [];
  const unpaidNames = [];

  for (const student of state.students) {
    if (week?.payments?.[student.id]?.paid) {
      paidNames.push(`${student.number}. ${student.name}`);
    } else {
      unpaidNames.push(`${student.number}. ${student.name}`);
    }
  }

  const lines = [
    `*Laporan ${state.className}*`,
    `Periode: ${week?.label || '-'} (${week?.dateLabel || '-'})`,
    `Nominal: ${formatRupiah(summary.activeWeekFee)} / siswa`,
    `Lunas: ${summary.activeWeekPaidCount}/${summary.totalStudents} (${formatRupiah(summary.activeWeekIncome)})`,
    `Total Saldo Kas: *${formatRupiah(summary.balance)}*`,
    '',
    `*Sudah Bayar (${paidNames.length}):*`,
    paidNames.length ? paidNames.join('\n') : '-',
    '',
    `*Belum Bayar (${unpaidNames.length}):*`,
    unpaidNames.length ? unpaidNames.join('\n') : 'Semua sudah bayar!',
  ];

  return lines.join('\n');
}

