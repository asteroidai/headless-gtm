/** A counting semaphore. Caps how many `claude` processes run at once. */
export class Pool {
  private active = 0;
  private waiters: Array<() => void> = [];

  constructor(public limit: number) {}

  async acquire(): Promise<() => void> {
    while (this.active >= this.limit) {
      await new Promise<void>((resolve) => this.waiters.push(resolve));
    }
    this.active++;
    let released = false;
    return () => {
      if (released) return;
      released = true;
      this.active--;
      this.waiters.shift()?.();
    };
  }

  status(): { limit: number; active: number; waiting: number } {
    return { limit: this.limit, active: this.active, waiting: this.waiters.length };
  }
}
