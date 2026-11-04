// Round dates (protocol 6.1): with `payoutRound` "monthly" (the default), the 1st of each month at 00:00;
// with "weekly", every Monday at 00:00. Both in the settings' time zone.

export type Cadence = 'monthly' | 'weekly';

/** Any value other than exactly "weekly" is read as monthly, so free-text configs keep working. */
export const cadenceOf = (v: unknown): Cadence => (v === 'weekly' ? 'weekly' : 'monthly');

function offsetMinutes(utcMs: number, tz: string): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: tz, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit',
  }).formatToParts(new Date(utcMs));
  const get = (t: string) => Number(parts.find(p => p.type === t)!.value);
  const asUtc = Date.UTC(get('year'), get('month') - 1, get('day'), get('hour'), get('minute'), get('second'));
  return Math.round((asUtc - utcMs) / 60000);
}

/** Unix time of 00:00 on a local calendar day in `tz` (month 0-11; day may overflow, like Date.UTC). */
export function localMidnight(year: number, month: number, day: number, tz: string): number {
  const guess = Date.UTC(year, month, day);
  let t = guess - offsetMinutes(guess, tz) * 60000;
  t = guess - offsetMinutes(t, tz) * 60000; // settle across a DST change
  return Math.floor(t / 1000);
}

/** Unix time of the 1st of `month` (0-11) of `year` at 00:00 in `tz`. */
export const monthStart = (year: number, month: number, tz: string) => localMidnight(year, month, 1, tz);

/** Local calendar date in `tz`: year, month (0-11), day. */
function localDate(unix: number, tz: string): [number, number, number] {
  const parts = new Intl.DateTimeFormat('en-US', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date(unix * 1000));
  const get = (t: string) => Number(parts.find(p => p.type === t)!.value);
  return [get('year'), get('month') - 1, get('day')];
}

/** ISO weekday of a calendar date: 1 = Monday … 7 = Sunday. */
const isoWeekday = (y: number, m: number, d: number) => ((new Date(Date.UTC(y, m, d)).getUTCDay() + 6) % 7) + 1;

/** The first round date strictly after `t`. */
export function nextRoundDate(t: number, tz: string, cadence: Cadence = 'monthly'): number {
  const [y, m, d] = localDate(t, tz);
  if (cadence === 'weekly') {
    for (let add = 1 - isoWeekday(y, m, d); ; add += 7) { // from this week's Monday
      const c = localMidnight(y, m, d + add, tz);
      if (c > t) return c;
    }
  }
  for (let mm = m; ; mm++) {
    const c = localMidnight(y, mm, 1, tz);
    if (c > t) return c;
  }
}

/** Rules in force at a moment: the cadence and time zone that decide the next round date. */
export type RoundRulesAt = (t: number) => { cadence: Cadence; tz: string; changes?: number[] };

/**
 * The next `n` round dates strictly after `t`. With a fixed cadence, dates follow it. With `rulesAt`,
 * each date follows the settings in force at that moment: `changes` lists the times settings changed,
 * and after a change of cadence the dates are counted afresh from the change.
 */
export function roundDatesAfter(t: number, tz: string, n: number, cadence: Cadence | RoundRulesAt = 'monthly'): number[] {
  const rulesAt: RoundRulesAt = typeof cadence === 'function' ? cadence : () => ({ cadence, tz });
  const out: number[] = [];
  let cur = t;
  while (out.length < n) {
    const r = rulesAt(cur);
    let next = nextRoundDate(cur, r.tz, r.cadence);
    // A settings change before that date, to a different cadence or time zone, restarts the count from the change.
    const change = (r.changes ?? []).filter(c => c > cur && c < next).sort((a, b) => a - b)
      .find(c => { const r2 = rulesAt(c); return r2.cadence !== r.cadence || r2.tz !== r.tz; });
    if (change !== undefined) {
      const r2 = rulesAt(change);
      next = nextRoundDate(change, r2.tz, r2.cadence);
    }
    out.push(next);
    cur = next;
  }
  return out;
}

/** ISO 8601 week of a calendar date: [week-year, week]. */
export function isoWeek(y: number, m: number, d: number): [number, number] {
  const date = Date.UTC(y, m, d);
  const thursday = new Date(date + (4 - isoWeekday(y, m, d)) * 86400000);
  const wy = thursday.getUTCFullYear();
  const week = 1 + Math.floor((thursday.getTime() - Date.UTC(wy, 0, 1)) / (7 * 86400000));
  return [wy, week];
}

/** The round's label for a round prepared at time `t`: "YYYY-MM" monthly, "YYYY-Www" weekly. */
export function roundLabel(t: number, tz: string, cadence: Cadence = 'monthly'): string {
  const [y, m, d] = localDate(t, tz);
  if (cadence === 'weekly') {
    const [wy, w] = isoWeek(y, m, d);
    return `${wy}-W${String(w).padStart(2, '0')}`;
  }
  return `${y}-${String(m + 1).padStart(2, '0')}`;
}
