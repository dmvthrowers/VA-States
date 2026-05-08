import { NextResponse } from 'next/server';

export interface ApiErrorBody {
  error: { code: string; message: string; requestId: string };
}

export type ApiErrorCode =
  | 'bad_request'
  | 'unauthorized'
  | 'forbidden'
  | 'not_found'
  | 'conflict'
  | 'unprocessable'
  | 'rate_limited'
  | 'upstream_error'
  | 'internal_error';

const STATUS_BY_CODE: Record<ApiErrorCode, number> = {
  bad_request: 400,
  unauthorized: 401,
  forbidden: 403,
  not_found: 404,
  conflict: 409,
  unprocessable: 422,
  rate_limited: 429,
  upstream_error: 502,
  internal_error: 500,
};

export function newRequestId(): string {
  return globalThis.crypto.randomUUID();
}

export function apiError(
  code: ApiErrorCode,
  message: string,
  requestId: string,
  extraHeaders?: Record<string, string>,
): NextResponse<ApiErrorBody> {
  return NextResponse.json(
    { error: { code, message, requestId } },
    { status: STATUS_BY_CODE[code], headers: { 'x-request-id': requestId, ...(extraHeaders ?? {}) } }
  );
}

export function withErrorHandling<Args extends unknown[]>(
  handler: (requestId: string, ...args: Args) => Promise<NextResponse>,
): (...args: Args) => Promise<NextResponse> {
  return async (...args: Args) => {
    const requestId = newRequestId();
    try {
      const res = await handler(requestId, ...args);
      if (!res.headers.has('x-request-id')) res.headers.set('x-request-id', requestId);
      return res;
    } catch (e) {
      console.error(`[api] unhandled error [${requestId}]:`, e);
      return apiError('internal_error', 'Something went wrong on our end.', requestId);
    }
  };
}
