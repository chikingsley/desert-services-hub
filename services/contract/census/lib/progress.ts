/**
 * CLI Progress Bar Utility
 *
 * Wraps cli-progress for consistent progress reporting across census scripts.
 */
import cliProgress from "cli-progress";

/**
 * Create a progress bar with standard formatting
 */
export function createProgressBar(total: number, label: string) {
  const bar = new cliProgress.SingleBar({
    format: `${label} |{bar}| {percentage}% | {value}/{total} | ETA: {eta}s`,
    barCompleteChar: "█",
    barIncompleteChar: "░",
    hideCursor: true,
    clearOnComplete: false,
  });
  bar.start(total, 0);
  return bar;
}

/**
 * Create a multi-bar container for parallel operations
 */
export function createMultiBar() {
  return new cliProgress.MultiBar({
    format: "{label} |{bar}| {percentage}% | {value}/{total} | ETA: {eta}s",
    barCompleteChar: "█",
    barIncompleteChar: "░",
    hideCursor: true,
    clearOnComplete: false,
  });
}

/**
 * Simple inline progress for quick operations
 */
export function logProgress(current: number, total: number, label: string) {
  const pct = ((current / total) * 100).toFixed(0);
  process.stdout.write(
    `\r${label}: ${current.toLocaleString()}/${total.toLocaleString()} (${pct}%)`
  );
  if (current === total) {
    process.stdout.write("\n");
  }
}
