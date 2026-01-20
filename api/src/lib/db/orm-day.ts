/** Static utility for working with day strings (YYYY-MM-DD format). */
export class ORMDay {
  private constructor() {}

  static today(): string {
    const now = new Date();
    return ORMDay.fromDate(now);
  }

  static fromDate(date: Date): string {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, "0");
    const d = String(date.getDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
  }
}
