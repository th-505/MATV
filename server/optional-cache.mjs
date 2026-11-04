/** A cache outage must never become a prerequisite for discovery/playback. */
export function createOptionalCacheReader({
  budgetMs = 700,
  cooldownMs = 30000,
  now = Date.now,
} = {}) {
  let blockedUntil = 0;
  const pending = new Map();
  return async function read(key, loader) {
    if (now() < blockedUntil) return null;
    if (pending.has(key)) return pending.get(key);
    if (pending.size >= 16) return null;
    let timer;
    const task = Promise.race([
      Promise.resolve().then(loader),
      new Promise((_, reject) => {
        timer = setTimeout(() => reject(Error("CACHE_BUDGET")), budgetMs);
      }),
    ])
      .catch(() => {
        blockedUntil = now() + cooldownMs;
        return null;
      })
      .finally(() => {
        clearTimeout(timer);
        pending.delete(key);
      });
    pending.set(key, task);
    return task;
  };
}
