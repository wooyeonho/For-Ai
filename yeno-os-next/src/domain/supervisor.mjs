// Supervision policy for the scheduler daemon.
//
// The decision of whether to start another daemon is pure and lives here so it
// can be tested without spawning anything, and so the supervisor process is a
// thin shell around a rule that is written down once:
//
//   - a clean exit is obeyed, never overridden: if the daemon decided it was
//     done, the supervisor does not resurrect it;
//   - a crash is answered with a new process after an exponential backoff, so a
//     daemon that dies instantly cannot become a spin loop;
//   - a daemon that keeps crashing inside a short window is a broken daemon,
//     not an unlucky one, so supervision stops and says so instead of hiding it
//     behind endless restarts.

export const BACKOFF_BASE_MS = 200;
export const BACKOFF_CAP_MS = 5_000;
export const CRASH_LOOP_LIMIT = 5;
export const CRASH_LOOP_WINDOW_MS = 10_000;

/** Exponential backoff, capped, deterministic. */
export function backoffMs(consecutiveCrashes, { baseMs = BACKOFF_BASE_MS, capMs = BACKOFF_CAP_MS } = {}) {
  if (consecutiveCrashes < 1) return 0;
  return Math.min(capMs, baseMs * 2 ** (consecutiveCrashes - 1));
}

/**
 * Decide what to do about a daemon that just exited.
 *
 * `crashTimes` are the timestamps of recent crashes including this one, so the
 * caller does not have to keep two counters in step.
 */
export function superviseDecision({
  code,
  signal,
  stopping = false,
  crashTimes = [],
  now = Date.now(),
  limit = CRASH_LOOP_LIMIT,
  windowMs = CRASH_LOOP_WINDOW_MS,
  baseMs = BACKOFF_BASE_MS,
  capMs = BACKOFF_CAP_MS,
} = {}) {
  if (stopping) return { action: 'stop', reason: 'SUPERVISOR_STOPPING', delayMs: 0 };
  if (signal === null && code === 0) return { action: 'stop', reason: 'DAEMON_EXITED_CLEANLY', delayMs: 0 };

  const inWindow = crashTimes.filter((t) => now - t <= windowMs);
  if (inWindow.length >= limit) {
    return { action: 'crash_loop', reason: 'DAEMON_CRASH_LOOP', delayMs: 0, crashesInWindow: inWindow.length };
  }
  return {
    action: 'restart',
    reason: signal ? `DAEMON_KILLED_${signal}` : `DAEMON_EXIT_${code}`,
    delayMs: backoffMs(inWindow.length, { baseMs, capMs }),
    crashesInWindow: inWindow.length,
  };
}
