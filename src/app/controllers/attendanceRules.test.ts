import { describe, it, expect } from 'vitest';
import { checkInRule, checkOutRule, stillOpen } from './attendanceRules';

const t = (day: number, hhmm: string) => { const [h, m] = hhmm.split(':').map(Number); return new Date(2026, 10, day, h, m); };

describe('day shift 08:00–17:00', () => {
  it('opens 30 min early and counts late minutes', () => {
    expect(checkInRule(t(17, '07:20'), '08:00', '17:00')).toEqual({ ok: false, error: 'Too early. You can scan starting at 07:30' });
    expect(checkInRule(t(17, '07:45'), '08:00', '17:00')).toMatchObject({ ok: true, lateMinutes: 0 });
    expect(checkInRule(t(17, '08:12'), '08:00', '17:00')).toMatchObject({ ok: true, lateMinutes: 12, logDate: t(17, '08:00') });
  });
  it('early leave, overtime, and clock-out allowed up to 6 h after the end', () => {
    expect(checkOutRule(t(17, '16:30'), t(17, '08:00'), '08:00', '17:00')).toMatchObject({ earlyLeaveMinutes: 30, overtimeMinutes: 0, workedMinutes: 510 });
    expect(checkOutRule(t(17, '19:00'), t(17, '08:00'), '08:00', '17:00')).toMatchObject({ earlyLeaveMinutes: 0, overtimeMinutes: 120 });
    expect(stillOpen(t(17, '23:00'), t(17, '08:00'), '08:00', '17:00')).toBe(true);
    expect(stillOpen(t(18, '07:55'), t(17, '08:00'), '08:00', '17:00')).toBe(false); // next morning = new check-in
  });
  it('ignores a double scan', () => {
    expect(checkOutRule(t(17, '08:03'), t(17, '08:00'), '08:00', '17:00')).toMatchObject({ ok: false });
  });
});

describe('overnight shift 22:00–06:00', () => {
  it('a late check-in after midnight belongs to the shift that started yesterday', () => {
    expect(checkInRule(t(17, '21:40'), '22:00', '06:00')).toMatchObject({ ok: true, lateMinutes: 0, logDate: t(17, '22:00') });
    expect(checkInRule(t(18, '00:10'), '22:00', '06:00')).toMatchObject({ ok: true, lateMinutes: 130, logDate: t(17, '22:00') });
    expect(checkInRule(t(18, '15:00'), '22:00', '06:00')).toMatchObject({ ok: false });
  });
  it('checking out the next morning closes it with the right overtime', () => {
    expect(stillOpen(t(18, '06:20'), t(17, '21:55'), '22:00', '06:00')).toBe(true);
    expect(checkOutRule(t(18, '06:20'), t(17, '21:55'), '22:00', '06:00'))
      .toEqual({ ok: true, workedMinutes: 505, earlyLeaveMinutes: 0, overtimeMinutes: 20 });
    expect(checkOutRule(t(18, '05:00'), t(18, '00:10'), '22:00', '06:00')).toMatchObject({ earlyLeaveMinutes: 60 });
  });
});
