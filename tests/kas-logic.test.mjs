import test from 'node:test';
import assert from 'node:assert/strict';
import {
  DEFAULT_FEE,
  DEFAULT_CARRYOVER_AMOUNT,
  createInitialState,
  calculateSummary,
  togglePayment,
  addStudentsBulk,
  deleteStudent,
  addWeek,
  deleteWeek,
  addExtraIncome,
  deleteExtraIncome,
  addExpense,
  deleteExpense,
  formatRupiah,
  normalizeState,
  buildWhatsAppReport,
  verifyTreasurerPassword,
} from '../kas-logic.js';

test('createInitialState starts with 40 PPLG 1 students and Rp600.000 carryover balance', () => {
  const state = createInitialState();
  const summary = calculateSummary(state);

  assert.equal(state.defaultFee, DEFAULT_FEE);
  assert.equal(state.className, 'Kas PPLG 1');
  assert.equal(state.students.length, 40);
  assert.equal(state.students[0].name, 'Abdul Mughni');
  assert.equal(state.students[39].name, 'Zulfikar Ramdhani');
  assert.equal(state.weeks.length, 1);
  assert.equal(state.extraIncomes.length, 1);
  assert.equal(summary.extraIncome, DEFAULT_CARRYOVER_AMOUNT);
  assert.equal(summary.weeklyIncome, 0);
  assert.equal(summary.balance, 600000);
  assert.equal(summary.activeWeekPaidCount, 0);
});

test('toggling student payment increases and decreases balance by Rp2.000', () => {
  let state = createInitialState();
  const weekId = state.activeWeekId;
  const student1 = state.students[0].id;
  const student2 = state.students[1].id;

  state = togglePayment(state, weekId, student1);
  assert.equal(calculateSummary(state).balance, 602000);
  assert.equal(calculateSummary(state).activeWeekPaidCount, 1);

  state = togglePayment(state, weekId, student2);
  assert.equal(calculateSummary(state).balance, 604000);
  assert.equal(calculateSummary(state).activeWeekPaidCount, 2);

  state = togglePayment(state, weekId, student1);
  assert.equal(calculateSummary(state).balance, 602000);
  assert.equal(calculateSummary(state).activeWeekPaidCount, 1);
});

test('weekly periods preserve previous week balance when adding a new week', () => {
  let state = createInitialState();
  const week1Id = state.activeWeekId;

  state = togglePayment(state, week1Id, state.students[0].id);
  state = togglePayment(state, week1Id, state.students[1].id);
  assert.equal(calculateSummary(state).balance, 604000);

  state = addWeek(state, 'Minggu 2', '2026-11-17');
  assert.equal(state.weeks.length, 2);
  assert.notEqual(state.activeWeekId, week1Id);

  let summary = calculateSummary(state);
  assert.equal(summary.balance, 604000);
  assert.equal(summary.activeWeekPaidCount, 0);

  state = togglePayment(state, state.activeWeekId, state.students[0].id);
  summary = calculateSummary(state);
  assert.equal(summary.balance, 606000);
  assert.equal(summary.activeWeekPaidCount, 1);
  assert.equal(summary.activeWeekIncome, 2000);
});

test('extra incomes add to total income and balance, and can be deleted', () => {
  let state = createInitialState();
  state = addExtraIncome(state, { title: 'Sisa dana pensi', amount: 50000, date: '2026-11-10' });
  let summary = calculateSummary(state);
  assert.equal(summary.extraIncome, 650000);
  assert.equal(summary.totalIncome, 650000);
  assert.equal(summary.balance, 650000);

  state = deleteExtraIncome(state, state.extraIncomes[0].id);
  summary = calculateSummary(state);
  assert.equal(summary.balance, 600000);
});

test('expenses subtract from total balance', () => {
  let state = createInitialState();
  const weekId = state.activeWeekId;
  state = togglePayment(state, weekId, state.students[0].id);
  state = togglePayment(state, weekId, state.students[1].id);
  state = togglePayment(state, weekId, state.students[2].id);

  state = addExpense(state, { title: 'Beli spidol', amount: 3500, date: '2026-11-10' });
  let summary = calculateSummary(state);
  assert.equal(summary.totalIncome, 606000);
  assert.equal(summary.totalExpense, 3500);
  assert.equal(summary.balance, 602500);

  state = deleteExpense(state, state.expenses[0].id);
  summary = calculateSummary(state);
  assert.equal(summary.balance, 606000);
});

test('bulk student addition, deletion, and week deletion behave safely', () => {
  let state = createInitialState();
  const initialCount = state.students.length;
  state = addStudentsBulk(state, 'Fajar\nGita\n\nHana');
  assert.equal(state.students.length, initialCount + 3);
  assert.equal(state.students[initialCount + 2].number, initialCount + 3);

  const fajar = state.students[initialCount];
  state = togglePayment(state, state.activeWeekId, fajar.id);
  assert.equal(calculateSummary(state).balance, 602000);

  state = deleteStudent(state, fajar.id);
  assert.equal(state.students.length, initialCount + 2);
  assert.equal(calculateSummary(state).balance, 600000);

  // Cannot delete the last remaining week
  const onlyWeekId = state.weeks[0].id;
  state = deleteWeek(state, onlyWeekId);
  assert.equal(state.weeks.length, 1);
});

test('formatRupiah, normalizeState migration, and WhatsApp report work properly', () => {
  assert.equal(formatRupiah(2000), 'Rp2.000');
  assert.equal(formatRupiah(-5000), '-Rp5.000');

  // Legacy state without extraIncomes gets seeded with Rp600.000
  const migrated = normalizeState({ className: 'XII IPA 1', defaultFee: 2000 });
  assert.equal(migrated.className, 'XII IPA 1');
  assert.equal(migrated.weeks.length, 1);
  assert.equal(migrated.extraIncomes.length, 1);
  assert.equal(migrated.extraIncomes[0].amount, 600000);

  // Explicit empty extraIncomes stays empty
  const cleared = normalizeState({ className: 'XII IPA 1', defaultFee: 2000, extraIncomes: [] });
  assert.equal(cleared.extraIncomes.length, 0);

  const report = buildWhatsAppReport(migrated);
  assert.match(report, /XII IPA 1/);
  assert.match(report, /Rp600\.000/);
});

test('verifyTreasurerPassword accepts only bendahara123', () => {
  assert.equal(verifyTreasurerPassword('bendahara123'), true);
  assert.equal(verifyTreasurerPassword('salah'), false);
  assert.equal(verifyTreasurerPassword(''), false);
});
