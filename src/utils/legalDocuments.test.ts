import test from 'node:test';
import assert from 'node:assert/strict';
import type { LegalDocuments } from '../types/maintenance.ts';
import {
  computeDaysUntilExpiry,
  evaluateLegalDocumentAlerts,
  evaluateLegalDocumentItem,
  evaluateLegalDocumentStatus,
  formatLegalExpiryCountdown,
  sortLegalDocuments,
  validateLegalDocumentInput,
} from './legalDocuments.ts';

test('computeDaysUntilExpiry calculates exact calendar day differences in UTC', () => {
  assert.equal(computeDaysUntilExpiry('2026-11-30', '2026-11-19'), 11);
  assert.equal(computeDaysUntilExpiry('2026-11-19', '2026-11-19'), 0);
  assert.equal(computeDaysUntilExpiry('2026-11-10', '2026-11-19'), -9);
  assert.equal(computeDaysUntilExpiry('invalid-date', '2026-11-19'), null);
});

test('evaluateLegalDocumentStatus categorizes expired, expiring_soon, and valid accurately', () => {
  assert.equal(evaluateLegalDocumentStatus(-1, 30), 'expired');
  assert.equal(evaluateLegalDocumentStatus(0, 30), 'expiring_soon');
  assert.equal(evaluateLegalDocumentStatus(30, 30), 'expiring_soon');
  assert.equal(evaluateLegalDocumentStatus(31, 30), 'valid');
});

test('evaluateLegalDocumentAlerts filters disabled or valid docs and sorts most urgent first', () => {
  const docs: LegalDocuments[] = [
    {
      id: 'doc-valid',
      docType: 'voluntary_insurance',
      title: 'ประกันชั้น 1',
      provider: 'วิริยะ',
      policyNumber: 'POL-001',
      issueDate: '2026-06-01',
      expiryDate: '2027-06-01',
      alertDaysBefore: 30,
      alertEnabled: true,
      cost: 14500,
    },
    {
      id: 'doc-soon',
      docType: 'compulsory_insurance',
      title: 'พ.ร.บ. ประจำปี',
      provider: 'กลางคุ้มครองผู้ประสบภัย',
      policyNumber: 'PRB-999',
      issueDate: '2025-12-01',
      expiryDate: '2026-12-01',
      alertDaysBefore: 30,
      alertEnabled: true,
      cost: 967,
    },
    {
      id: 'doc-disabled',
      docType: 'registration_tax',
      title: 'ป้ายภาษี (ปิดเตือน)',
      provider: 'ขนส่ง',
      policyNumber: 'TAX-111',
      issueDate: '2025-11-01',
      expiryDate: '2026-11-25',
      alertDaysBefore: 30,
      alertEnabled: false,
      cost: 2400,
    },
    {
      id: 'doc-expired',
      docType: 'registration_tax',
      title: 'ป้ายภาษี 2569',
      provider: 'กรมการขนส่งทางบก',
      policyNumber: 'TAX-222',
      issueDate: '2025-11-10',
      expiryDate: '2026-11-10',
      alertDaysBefore: 30,
      alertEnabled: true,
      cost: 2400,
    },
  ];

  const alerts = evaluateLegalDocumentAlerts(docs, '2026-11-19');
  assert.equal(alerts.length, 2);
  assert.equal(alerts[0].documentId, 'doc-expired');
  assert.equal(alerts[0].status, 'expired');
  assert.equal(alerts[0].daysRemaining, -9);

  assert.equal(alerts[1].documentId, 'doc-soon');
  assert.equal(alerts[1].status, 'expiring_soon');
  assert.equal(alerts[1].daysRemaining, 12);
});

test('sortLegalDocuments orders soonest expiry dates first', () => {
  const docs: LegalDocuments[] = [
    {
      id: 'b',
      docType: 'voluntary_insurance',
      title: 'B',
      provider: '',
      policyNumber: '',
      issueDate: '2026-01-01',
      expiryDate: '2027-01-01',
      alertDaysBefore: 30,
      alertEnabled: true,
      cost: 0,
    },
    {
      id: 'a',
      docType: 'compulsory_insurance',
      title: 'A',
      provider: '',
      policyNumber: '',
      issueDate: '2025-12-01',
      expiryDate: '2026-12-01',
      alertDaysBefore: 30,
      alertEnabled: true,
      cost: 0,
    },
  ];

  const sorted = sortLegalDocuments(docs);
  assert.deepEqual(
    sorted.map((d) => d.id),
    ['a', 'b']
  );
  assert.equal(evaluateLegalDocumentItem(sorted[0], '2026-11-19')?.daysRemaining, 12);
  assert.equal(formatLegalExpiryCountdown(-3), 'หมดอายุแล้ว 3 วัน');
  assert.equal(formatLegalExpiryCountdown(0), 'หมดอายุวันนี้');
  assert.equal(formatLegalExpiryCountdown(15), 'เหลืออีก 15 วัน');
});

test('validateLegalDocumentInput catches missing title, invalid dates, and expiry before issueDate', () => {
  assert.equal(
    validateLegalDocumentInput({
      title: '',
      issueDate: '2026-11-01',
      expiryDate: '2027-11-01',
      alertDaysBefore: '30',
      cost: '645',
    }).valid,
    false
  );

  assert.equal(
    validateLegalDocumentInput({
      title: 'พ.ร.บ.',
      issueDate: '2026-11-01',
      expiryDate: '2026-10-01',
      alertDaysBefore: '30',
      cost: '645',
    }).valid,
    false
  );

  assert.equal(
    validateLegalDocumentInput({
      title: 'พ.ร.บ.',
      issueDate: '2026-11-01',
      expiryDate: '2027-11-01',
      alertDaysBefore: '30',
      cost: '645',
    }).valid,
    true
  );
});
