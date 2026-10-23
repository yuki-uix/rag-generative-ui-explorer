import { env } from 'cloudflare:workers';
import { handleCardsRequest } from '../../../server/live-cards.js';
import { liveRequestLimiter } from '../../../server/live-limit.js';

const ALLOWED_ORIGINS = new Set([
  'https://yuki-uix.github.io',
  ...['http://localhost', 'http://127.0.0.1'].flatMap((host) => [3000, 4174, 5173].map((port) => `${host}:${port}`)),
]);

function cors(request: Request, response: Response): Response {
  const headers = new Headers(response.headers);
  headers.set('Cache-Control', 'no-store');
  headers.set('Vary', 'Origin');
  const origin = request.headers.get('origin');
  if (origin && ALLOWED_ORIGINS.has(origin)) {
    headers.set('Access-Control-Allow-Origin', origin);
    headers.set('Access-Control-Allow-Methods', 'POST, OPTIONS');
    headers.set('Access-Control-Allow-Headers', 'Content-Type');
  }
  return new Response(response.body, { status: response.status, headers });
}

function denied(request: Request): boolean {
  const origin = request.headers.get('origin');
  return origin !== null && !ALLOWED_ORIGINS.has(origin) && origin !== new URL(request.url).origin;
}

export async function OPTIONS(request: Request): Promise<Response> {
  return cors(request, Response.json({ ok: !denied(request) }, { status: denied(request) ? 403 : 200 }));
}

/** Credentials are Worker bindings and never enter the client bundle. */
export async function POST(request: Request): Promise<Response> {
  if (denied(request)) return cors(request, Response.json({ error: 'Origin is not permitted.' }, { status: 403 }));
  const apiKey = (env as Record<string, unknown>)['DEEPSEEK_API_KEY'];
  return cors(request, await liveRequestLimiter.run(request, () =>
    handleCardsRequest(request, { apiKey: typeof apiKey === 'string' ? apiKey : undefined })));
}
