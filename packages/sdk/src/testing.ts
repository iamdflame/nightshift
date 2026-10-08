/**
 * Test utilities: a scripted `fetch` that records every request. Exported so downstream packages
 * can test against the SDK offline.
 */
export interface RecordedRequest {
  url: string;
  method: string;
  headers: Record<string, string>;
  body: string | undefined;
  redirect: RequestRedirect | undefined;
}

export type Scripted = Response | Error | ((req: RecordedRequest, signal?: AbortSignal | null) => Response | Error | Promise<Response | Error>);

export interface MockFetch {
  fetch: typeof fetch;
  requests: RecordedRequest[];
  /** Append more scripted responses. */
  push(...items: Scripted[]): void;
}

export function json(body: unknown, init: { status?: number; headers?: Record<string, string> } = {}): Response {
  return new Response(JSON.stringify(body), {
    status: init.status ?? 200,
    headers: { "content-type": "application/json", date: new Date().toUTCString(), ...init.headers },
  });
}

/** OCResult success envelope. */
export function ok(data: unknown, extra: Record<string, unknown> = {}): Response {
  return json({ code: 0, msg: "success", data, timestamp: Date.now(), success: true, ...extra });
}

/** Gateway / business error envelope. */
export function apiError(code: number | string, msg: string, status = 200, headers: Record<string, string> = {}): Response {
  return json({ code, msg, data: null, timestamp: Date.now() }, { status, headers });
}

export function mockFetch(...script: Scripted[]): MockFetch {
  const queue = [...script];
  const requests: RecordedRequest[] = [];
  const impl = async (input: string | URL | Request, init: RequestInit = {}): Promise<Response> => {
    const headers: Record<string, string> = {};
    new Headers(init.headers).forEach((v, k) => (headers[k] = v));
    const req: RecordedRequest = {
      url: String(input),
      method: init.method ?? "GET",
      headers,
      body: typeof init.body === "string" ? init.body : undefined,
      redirect: init.redirect,
    };
    requests.push(req);
    const next = queue.shift();
    if (next === undefined) throw new Error(`mockFetch: unexpected request #${requests.length} ${req.method} ${req.url}`);
    const r = typeof next === "function" ? await next(req, init.signal) : next;
    if (r instanceof Error) throw r;
    return r;
  };
  return { fetch: impl as typeof fetch, requests, push: (...items) => queue.push(...items) };
}
