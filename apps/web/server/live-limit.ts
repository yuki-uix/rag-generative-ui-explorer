/** Coarse protection per Worker isolate, not an account-wide billing quota. */
export class LiveRequestLimiter {
  private clients = new Map<string, { start: number; count: number }>();
  private active = 0;
  constructor(private readonly now = Date.now) {}

  async run(
    request: Request,
    operation: () => Promise<Response>,
  ): Promise<Response> {
    const now = this.now();
    for (const [key, window] of this.clients) {
      if (now - window.start >= 60_000) this.clients.delete(key);
    }
    const refuse = (
      code: string,
      message: string,
      status: number,
      retry: string,
    ) =>
      Response.json(
        { status: 'error', code, message },
        {
          status,
          headers: {
            'Cache-Control': 'no-store',
            'Retry-After': retry,
          },
        },
      );
    if (this.active >= 4)
      return refuse(
        'service-busy',
        '当前生成请求较多，请稍后再试。',
        503,
        '10',
      );
    // Cloudflare replaces CF-Connecting-IP at its boundary. Do not trust a
    // browser-supplied X-Forwarded-For header or include IPs in response/logs.
    const key = request.headers.get('cf-connecting-ip') ?? 'local-development';
    const window = this.clients.get(key);
    if (window && window.count >= 8)
      return refuse(
        'rate-limited',
        '提问过于频繁，请一分钟后再试。',
        429,
        '60',
      );
    if (!window && this.clients.size >= 1024)
      return refuse('service-busy', '当前服务繁忙，请稍后再试。', 503, '60');
    this.clients.set(
      key,
      window
        ? { ...window, count: window.count + 1 }
        : { start: now, count: 1 },
    );
    this.active++;
    try {
      return await operation();
    } finally {
      this.active--;
    }
  }
}

export const liveRequestLimiter = new LiveRequestLimiter();
