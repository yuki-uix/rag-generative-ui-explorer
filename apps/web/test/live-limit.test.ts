import { expect, it } from 'vitest';
import { LiveRequestLimiter } from '../server/live-limit';
const request = (ip = '192.0.2.1') =>
  new Request('https://example.test/api/cards', {
    headers: { 'cf-connecting-ip': ip },
  });

it('bounds accepted calls per client and resets the window without leaking identity', async () => {
  let now = 0,
    calls = 0;
  const limiter = new LiveRequestLimiter(() => now);
  const run = () =>
    limiter.run(request(), async () => {
      calls++;
      return Response.json({ ok: true });
    });
  for (let n = 0; n < 8; n++) expect((await run()).status).toBe(200);
  const limited = await run();
  expect(limited.status).toBe(429);
  expect(calls).toBe(8);
  expect(limited.headers.get('retry-after')).toBe('60');
  expect(await limited.text()).not.toContain('192.0.2.1');
  now = 60_000;
  expect((await run()).status).toBe(200);
});

it('rejects excess simultaneous work and releases slots after a failure', async () => {
  const limiter = new LiveRequestLimiter();
  let release!: () => void;
  const wait = new Promise<void>((done) => {
    release = done;
  });
  const running = Array.from({ length: 4 }, (_, i) =>
    limiter
      .run(request(`192.0.2.${i}`), async () => {
        await wait;
        throw new Error('simulated failure');
      })
      .catch(() => null),
  );
  expect(
    (await limiter.run(request('192.0.2.9'), async () => Response.json({})))
      .status,
  ).toBe(503);
  release();
  await Promise.all(running);
  expect(
    (await limiter.run(request('192.0.2.9'), async () => Response.json({})))
      .status,
  ).toBe(200);
});
