/**
 * Static safety checks for 0026. These do NOT execute the SQL (no Postgres is
 * available in CI/dev); they pin the properties that make the migration safe to
 * apply to a database full of existing HR data.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const raw = readFileSync(fileURLToPath(new URL('./0026_employee_performance.sql', import.meta.url)), 'utf8');
// Executable SQL only: strip `--` comments (the rollback block is commented out).
const sql = raw.split('\n').map(l => l.replace(/--.*$/, '')).join('\n');
const EXISTING = ['employees', 'users', 'attendance_logs', 'payroll_summary', 'leave_requests',
  'employee_fingerprints', 'orders', 'order_items', 'order_payments'];

describe('0026_employee_performance.sql', () => {
  it('is purely additive: never alters, drops, updates or deletes existing tables', () => {
    for (const t of EXISTING) {
      expect(sql).not.toMatch(new RegExp(`ALTER\\s+TABLE\\s+(IF\\s+EXISTS\\s+)?${t}\\b`, 'i'));
      expect(sql).not.toMatch(new RegExp(`DROP\\s+TABLE\\s+(IF\\s+EXISTS\\s+)?${t}\\b`, 'i'));
      expect(sql).not.toMatch(new RegExp(`UPDATE\\s+${t}\\b`, 'i'));
      expect(sql).not.toMatch(new RegExp(`DELETE\\s+FROM\\s+${t}\\b`, 'i'));
      expect(sql).not.toMatch(new RegExp(`INSERT\\s+INTO\\s+${t}\\b`, 'i'));
    }
    expect(sql).not.toMatch(/\bDROP\s+TABLE\b/i);
    expect(sql).not.toMatch(/\bTRUNCATE\b/i);
  });

  it('creates exactly one new table, idempotently', () => {
    const creates = [...sql.matchAll(/CREATE\s+TABLE\s+(IF\s+NOT\s+EXISTS\s+)?(\w+)/gi)];
    expect(creates.map(m => m[2])).toEqual(['employee_performance_observations']);
    expect(creates[0][1]).toBeTruthy(); // IF NOT EXISTS
  });

  it('links to employees by the existing business key and validates it in-branch', () => {
    expect(sql).toMatch(/employee_id\s+TEXT,/);
    expect(sql).toMatch(/FROM employees e\s+WHERE e\.employee_id = NEW\.employee_id\s+AND e\.branch_id\s+= NEW\.branch_id/);
  });

  it('forces AI observations into manager review and requires evidence', () => {
    expect(sql).toMatch(/IF NEW\.source = 'ai_cctv' THEN\s+NEW\.review_status\s+:= 'pending'/);
    expect(sql).toMatch(/epo_ai_requires_evidence CHECK/);
    expect(sql).toMatch(/epo_counted_requires_employee CHECK/);
    expect(sql).toMatch(/epo_reviewed_requires_reviewer CHECK/);
  });

  it('keeps evidence immutable and preserves the original AI attribution', () => {
    expect(sql).toMatch(/NEW\.evidence IS DISTINCT FROM OLD\.evidence/);
    expect(sql).toMatch(/NEW\.original_employee_id := COALESCE\(OLD\.employee_id/);
  });

  it('documents a rollback that only drops what it created', () => {
    const rollback = raw.slice(raw.indexOf('ROLLBACK'));
    expect(rollback).toMatch(/DROP TABLE\s+IF EXISTS employee_performance_observations/);
    expect(rollback).toMatch(/DROP FUNCTION IF EXISTS public\.epo_validate\(\)/);
    for (const t of EXISTING) expect(rollback).not.toMatch(new RegExp(`DROP TABLE\\s+IF EXISTS ${t}\\b`));
  });
});
