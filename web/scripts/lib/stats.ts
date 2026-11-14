// Small helpers shared by the eval runners.

/** 95% Wilson interval for a pass rate. Honest about small samples: 5 of 5 gives 57% to 100%. */
export function wilson(passed: number, total: number): { low: number; high: number } {
  if (total === 0) return { low: 0, high: 1 };
  const z = 1.96;
  const p = passed / total;
  const denominator = 1 + (z * z) / total;
  const centre = (p + (z * z) / (2 * total)) / denominator;
  const half =
    (z * Math.sqrt((p * (1 - p)) / total + (z * z) / (4 * total * total))) / denominator;
  return { low: Math.max(0, centre - half), high: Math.min(1, centre + half) };
}

export function percent(rate: number): string {
  return `${(rate * 100).toFixed(0)}%`;
}

export function rateWithRange(passed: number, total: number): string {
  const { low, high } = wilson(passed, total);
  return `${passed}/${total} (${percent(passed / Math.max(total, 1))}, likely ${percent(low)} to ${percent(high)})`;
}

export function median(values: number[]): number {
  if (values.length === 0) return Number.NaN;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}
