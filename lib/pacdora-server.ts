// Dieline API v2. The App Key stays in PACDORA_APP_KEY and is never sent to the browser.
// Base URL defaults to https://api.pacdora.com/api/v2. Paths below are /open/v2/...

const DEFAULT_BASE = "https://api.pacdora.com/api/v2";

export type PacdoraFailure = {
  status: number;
  message: string;
  traceId: string | null;
  errorCode: string | null;
  retryAction: string | null;
};

export class PacdoraRequestError extends Error {
  status: number;
  traceId: string | null;
  errorCode: string | null;
  retryAction: string | null;

  constructor(failure: PacdoraFailure) {
    super(failure.message);
    this.status = failure.status;
    this.traceId = failure.traceId;
    this.errorCode = failure.errorCode;
    this.retryAction = failure.retryAction;
  }
}

type PacdoraBody = {
  code?: number;
  msg?: string;
  data?: unknown;
  total?: number;
  traceId?: string;
};

function credentials() {
  const appId = process.env.PACDORA_APP_ID?.trim();
  const appKey = process.env.PACDORA_APP_KEY?.trim();
  if (!appId || !appKey) return null;
  return { appId, appKey };
}

function baseUrl() {
  return (process.env.PACDORA_API_BASE_URL?.trim() || DEFAULT_BASE).replace(/\/$/, "");
}

export async function pacdoraGet(path: string, query: Record<string, string>, requestId?: string) {
  const auth = credentials();
  if (!auth) {
    throw new PacdoraRequestError({
      status: 500,
      message: "Pacdora is not configured",
      traceId: null,
      errorCode: null,
      retryAction: "none",
    });
  }

  const url = new URL(`${baseUrl()}${path}`);
  for (const [name, value] of Object.entries(query)) url.searchParams.set(name, value);
  const headers: Record<string, string> = {
    "x-pacdora-appid": auth.appId,
    "x-pacdora-appkey": auth.appKey,
  };
  if (requestId) headers["x-pacdora-request-id"] = requestId;

  let response: Response;
  try {
    response = await fetch(url, { headers, cache: "no-store" });
  } catch {
    throw new PacdoraRequestError({
      status: 502,
      message: "Pacdora is unavailable",
      traceId: null,
      errorCode: null,
      retryAction: "same_request",
    });
  }

  const type = response.headers.get("content-type") ?? "";
  if (!type.includes("application/json")) {
    throw new PacdoraRequestError({
      status: 502,
      message: "Pacdora is unavailable",
      traceId: response.headers.get("x-trace-id"),
      errorCode: null,
      retryAction: "same_request",
    });
  }

  const body = (await response.json()) as PacdoraBody;
  const traceId = body.traceId ?? response.headers.get("x-trace-id");
  if (!response.ok || body.code !== 200) {
    const detail =
      body.data && typeof body.data === "object"
        ? (body.data as { error?: { code?: string; retryAction?: string } }).error
        : undefined;
    const errorCode = detail?.code ?? null;
    const retryAction = detail?.retryAction ?? "none";
    console.error(
      "[dieline]",
      JSON.stringify({ path, http: response.status, code: body.code ?? null, errorCode, traceId }),
    );
    throw new PacdoraRequestError({
      status: body.code === 402 ? 402 : body.code === 422 ? 422 : 502,
      message: errorCode === "DIELINE_V2_INSUFFICIENT_CREDITS" ? "No Pacdora credits left" : "Pacdora rejected the request",
      traceId,
      errorCode,
      retryAction,
    });
  }

  return body;
}
