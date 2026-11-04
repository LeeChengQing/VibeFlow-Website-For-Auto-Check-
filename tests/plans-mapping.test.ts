import test from 'node:test';
import assert from 'node:assert/strict';
import {
  dbPlanToUiPlan,
  uiPlanToDbPlan,
  getOrderPlanDisplay,
  type DbPlanCode,
  type UiPlanCode,
  type OrderPlanCode,
} from '../lib/plans';

test('bidirectional mapping between DB plans and UI plans', () => {
  const cases: Array<[DbPlanCode, UiPlanCode]> = [
    ['extension', 'extension'],
    ['semester', 'mobile_notification'],
    ['yearly', 'mobile_notification_yearly'],
    ['bundle', 'bundle'],
  ];

  for (const [db, ui] of cases) {
    assert.equal(dbPlanToUiPlan(db), ui);
    assert.equal(uiPlanToDbPlan(ui), db);
  }
});

test('getOrderPlanDisplay safely formats all DB and UI plan codes in both locales', () => {
  const allCodes: (OrderPlanCode | DbPlanCode)[] = [
    'extension',
    'semester',
    'yearly',
    'bundle',
    'mobile_notification',
    'mobile_notification_yearly',
    'mobile_notification_degree_pass',
  ];

  for (const code of allCodes) {
    for (const locale of ['zh', 'en'] as const) {
      const display = getOrderPlanDisplay(code as any, locale);
      assert.ok(display.name, `Missing name for ${code} in ${locale}`);
      assert.equal(typeof display.name, 'string');
      assert.equal(typeof display.period, 'string');
    }
  }
});

test('legacy mobile_notification_degree_pass formats safely', () => {
  const zh = getOrderPlanDisplay('mobile_notification_degree_pass', 'zh');
  const en = getOrderPlanDisplay('mobile_notification_degree_pass', 'en');
  assert.equal(zh.name, 'Degree Pass (已停售)');
  assert.equal(en.name, 'Degree Pass (legacy)');
});
