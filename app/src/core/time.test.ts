// Protocol 6.1: round dates and labels, monthly and weekly (test cases P-W01 to P-W08).
import { describe, expect, it } from 'vitest';
import { cadenceOf, roundDatesAfter, roundLabel, type RoundRulesAt } from './time';

const TZ = 'Europe/Rome';
const at = (iso: string) => Math.floor(Date.parse(iso) / 1000);

describe('round dates (6.1)', () => {
  it('P-W01: weekly dates are Mondays at 00:00 local time', () => {
    expect(roundDatesAfter(at('2026-11-04T15:00:00Z'), TZ, 2, 'weekly')).toEqual([at('2026-11-08T23:00:00Z'), at('2026-11-15T23:00:00Z')]);
  });

  it('a date exactly on a round date counts the next one', () => {
    expect(roundDatesAfter(at('2026-11-08T23:00:00Z'), TZ, 1, 'weekly')).toEqual([at('2026-11-15T23:00:00Z')]);
    expect(roundDatesAfter(at('2026-11-30T23:00:00Z'), TZ, 1, 'monthly')).toEqual([at('2026-12-31T23:00:00Z')]);
  });

  it('P-W02, P-W03: ISO week labels across the year end', () => {
    expect(roundLabel(at('2027-01-01T12:00:00Z'), TZ, 'weekly')).toBe('2026-W53');
    expect(roundLabel(at('2027-01-04T12:00:00Z'), TZ, 'weekly')).toBe('2027-W01');
    expect(roundLabel(at('2026-11-04T12:00:00Z'), TZ, 'weekly')).toBe('2026-W45');
    // just after local midnight on Monday 4 January, still 3 January in UTC
    expect(roundLabel(at('2027-01-03T23:30:00Z'), TZ, 'weekly')).toBe('2027-W01');
    expect(roundLabel(at('2026-12-15T12:00:00Z'), TZ, 'monthly')).toBe('2026-12');
  });

  it('P-W04: two weekly round dates after a Monday-morning tally', () => {
    const [, lapse] = roundDatesAfter(at('2026-11-09T09:00:00Z'), TZ, 2, 'weekly');
    expect(lapse).toBe(at('2026-11-22T23:00:00Z'));
  });

  it('P-W06: any value other than "weekly" is monthly', () => {
    expect(cadenceOf('monthly, 1st of the month')).toBe('monthly');
    expect(cadenceOf(undefined)).toBe('monthly');
    expect(cadenceOf('weekly')).toBe('weekly');
  });

  it('P-W07: after a change to weekly, dates count from the change', () => {
    const change = at('2026-11-05T11:00:00Z');
    const rulesAt: RoundRulesAt = t => ({ cadence: t >= change ? 'weekly' : 'monthly', tz: TZ, changes: [0, change] });
    // tallied on 2 November under monthly rules: without the change, the dates would be 1 December and 1 January
    expect(roundDatesAfter(at('2026-11-02T09:00:00Z'), TZ, 2, rulesAt)).toEqual([at('2026-11-08T23:00:00Z'), at('2026-11-15T23:00:00Z')]);
  });

  it('P-W08: the first Monday after summer time starts is 00:00 CEST', () => {
    expect(roundDatesAfter(at('2027-03-27T12:00:00Z'), TZ, 1, 'weekly')).toEqual([at('2027-03-28T22:00:00Z')]);
  });
});
