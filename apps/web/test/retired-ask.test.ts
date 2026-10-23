import { expect, it } from 'vitest';
import { POST } from '../app/api/ask/route.js';

it('retires the unbounded legacy paid endpoint without invoking generation', async () => {
  const response = POST();
  expect(response.status).toBe(410);
  expect(response.headers.get('cache-control')).toBe('no-store');
  expect(await response.json()).toEqual({
    error:
      'This endpoint has retired. Use /api/cards for grounded knowledge cards.',
  });
});
