/** Five-field cron: minute hour day-of-month month day-of-week. Supports `*`, n, a-b, a,b, * /n. Sunday is 0 or 7. */

const RANGES: Array<[number, number]> = [[0, 59], [0, 23], [1, 31], [1, 12], [0, 7]];

interface Part {
  from: number;
  to: number;
  step: number;
}

/** Throw when any field cannot be read, so a typo fails at load instead of never firing. */
export function parseCron(expr: string): Part[][] {
  const fields = expr.trim().split(/\s+/);
  if (fields.length !== 5) throw new Error(`bad cron "${expr}"`);
  return fields.map((field, i) => parseField(expr, field, RANGES[i]!));
}

export function cronMatches(expr: string, date: Date): boolean {
  const parsed = parseCron(expr);
  const values = [date.getMinutes(), date.getHours(), date.getDate(), date.getMonth() + 1, date.getDay()];
  return parsed.every((parts, i) => {
    const value = values[i]!;
    return matches(parts, value) || (i === 4 && value === 0 && matches(parts, 7));
  });
}

function parseField(expr: string, field: string, [lo, hi]: [number, number]): Part[] {
  const bad = () => new Error(`bad cron "${expr}"`);
  return field.split(",").map((part) => {
    const [range, stepText, ...rest] = part.split("/");
    if (!range || rest.length) throw bad();
    const step = stepText === undefined ? 1 : Number(stepText);
    let from = lo;
    let to = hi;
    if (range !== "*") {
      const bounds = range.split("-").map(Number);
      if (bounds.length > 2 || !bounds.every(Number.isInteger)) throw bad();
      from = bounds[0]!;
      to = bounds[1] ?? from;
    }
    if (!Number.isInteger(step) || step < 1 || from < lo || to > hi || from > to) throw bad();
    return { from, to, step };
  });
}

function matches(parts: Part[], value: number): boolean {
  return parts.some((p) => value >= p.from && value <= p.to && (value - p.from) % p.step === 0);
}

/** Call `onTick(name)` once per minute for every schedule whose cron matches. */
export function startCron(
  schedules: Array<{ name: string; cron: string }>,
  onTick: (name: string) => void,
): () => void {
  // Start from the current minute. A restart inside a matching minute must not fire the schedule again.
  let lastMinute = Math.floor(Date.now() / 60_000);
  const timer = setInterval(() => {
    const now = new Date();
    const minute = Math.floor(now.getTime() / 60_000);
    if (minute === lastMinute) return;
    lastMinute = minute;
    for (const s of schedules) if (cronMatches(s.cron, now)) onTick(s.name);
  }, 5_000);
  return () => clearInterval(timer);
}
