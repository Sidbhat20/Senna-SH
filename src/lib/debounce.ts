export const REFRESH_DEBOUNCE_MS = 400;

/** Calls `fn` once, `wait` ms after the last call in a burst. `cancel()` drops a pending call. */
export function debounce(fn: () => void, wait: number) {
  let t: ReturnType<typeof setTimeout> | undefined;
  const run = () => {
    clearTimeout(t);
    t = setTimeout(fn, wait);
  };
  run.cancel = () => clearTimeout(t);
  return run;
}
