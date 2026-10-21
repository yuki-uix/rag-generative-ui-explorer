export interface CallBudget { used: number; limit: number }
export interface RequestRecord {
  url: string; method: string; body: unknown; status: number | null;
  /** Optional for historical records. Used to identify the applicable billing window. */
  startedAt?: string | undefined; completedAt?: string | undefined;
}

/** Count every actual HTTP attempt; never retain authentication headers. */
export function recordingTransport(budget: CallBudget, requests: RequestRecord[], transport: typeof globalThis.fetch) {
  let exceeded = false;
  const fetch: typeof globalThis.fetch = async (url, init) => {
    if (budget.used >= budget.limit) {
      exceeded = true;
      throw Object.assign(new Error('Model call budget exhausted at transport boundary.'), { name: 'BudgetExceededError' });
    }
    budget.used++;
    const endpoint = new URL(url instanceof Request ? url.url : String(url));
    endpoint.username = ''; endpoint.password = ''; endpoint.search = ''; endpoint.hash = '';
    const body = typeof init?.body === 'string' ? init.body : url instanceof Request ? await url.clone().text() : null;
    const request: RequestRecord = {
      url: endpoint.toString(), method: init?.method ?? (url instanceof Request ? url.method : 'POST'),
      body: body === null ? null : JSON.parse(body), status: null, startedAt: new Date().toISOString(),
    };
    requests.push(request);
    try {
      const response = await transport(url, init);
      request.status = response.status;
      return response;
    } finally {
      // fetch returns at response headers; stream completion is recorded on the
      // surrounding model call. This is not the end of token generation.
      request.completedAt = new Date().toISOString();
    }
  };
  return { fetch, exceeded: () => exceeded };
}

export function safeError(error: unknown): { name: string; status: number | null } {
  return {
    name: error instanceof Error ? error.name : 'UnknownError',
    status: error !== null && typeof error === 'object' && 'status' in error && typeof error.status === 'number' ? error.status : null,
  };
}
