// Transfer a reserved permit directly to the oldest waiter (no race on release).
export function createConcurrencyQueue({ concurrency = 6, maxQueued = 30 } = {}) {
  if (!Number.isInteger(concurrency) || concurrency < 1 || !Number.isInteger(maxQueued) || maxQueued < 0)
    throw Error('INVALID_QUEUE_LIMITS');
  let active = 0;
  const waiting = [];
  async function run(task) {
    if (active < concurrency) active++;
    else {
      if (waiting.length >= maxQueued) throw Error('SERVER_BUSY_QUEUE_FULL');
      await new Promise(resolve => waiting.push(resolve));
    }
    try { return await task(); }
    finally {
      const next = waiting.shift();
      if (next) next();
      else active--;
    }
  }
  return Object.freeze({ run, metrics: () => ({ active, queued: waiting.length }) });
}
