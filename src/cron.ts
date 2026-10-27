/** Five-field cron: minute hour day-of-month month day-of-week. Supports `*`, n, a-b, a,b, * /n. */
export function cronMatches(expr: string, date: Date): boolean {
  const fields = expr.trim().split(/\s+/);
  if (fields.length !== 5) throw new Error(`bad cron "${expr}"`);
  const values = [date.getMinutes(), date.getHours(), date.getDate(), date.getMonth() + 1, date.getDay()];
  const ranges: Array<[number, number]> = [[0, 59], [0, 23], [1, 31], [1, 12], [0, 6]];
  return fields.every((field, i) => fieldMatches(field, values[i]!, ranges[i]!));
}

function fieldMatches(field: string, value: number, [lo, hi]: [number, number]): boolean {
  return field.split(",").some((part) => {
    const [range, stepText] = part.split("/");
    const step = stepText ? Number(stepText) : 1;
    let from = lo;
    let to = hi;
    if (range !== "*") {
      const [a, b] = range!.split("-").map(Number);
      from = a!;
      to = b ?? a!;
    }
    if (value < from || value > to) return false;
    return (value - from) % step === 0;
  });
}

/** Call `onTick(name)` once per minute for every schedule whose cron matches. */
export function startCron(
  schedules: Array<{ name: string; cron: string }>,
  onTick: (name: string) => void,
): () => void {
  let lastMinute = -1;
  const timer = setInterval(() => {
    const now = new Date();
    const minute = Math.floor(now.getTime() / 60_000);
    if (minute === lastMinute) return;
    lastMinute = minute;
    for (const s of schedules) if (cronMatches(s.cron, now)) onTick(s.name);
  }, 5_000);
  return () => clearInterval(timer);
}
