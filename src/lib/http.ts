import type { Context } from "hono";
import type { AppEnv } from "../types";

export const MAX_BODY_BYTES = 32 * 1024;

export function requestId(request: Request): string {
  const supplied = request.headers.get("x-request-id")?.trim();
  return supplied && supplied.length <= 128 ? supplied : crypto.randomUUID();
}

export function errorResponse(
  c: Context<AppEnv>,
  status: 400 | 401 | 404 | 405 | 409 | 413 | 422 | 500 | 502 | 503 | 504,
  code: string,
  message: string,
  details?: unknown,
) {
  return c.json(
    {
      error: {
        code,
        message,
        requestId: c.get("requestId"),
        ...(details === undefined ? {} : { details }),
      },
    },
    status,
  );
}

export async function readJsonBody<T>(c: Context<AppEnv>): Promise<T> {
  const declared = Number(c.req.header("content-length") ?? "0");
  if (Number.isFinite(declared) && declared > MAX_BODY_BYTES) {
    throw new BodyError(413, "body_too_large", `Request body exceeds ${MAX_BODY_BYTES} bytes.`);
  }

  const text = await c.req.text();
  if (new TextEncoder().encode(text).byteLength > MAX_BODY_BYTES) {
    throw new BodyError(413, "body_too_large", `Request body exceeds ${MAX_BODY_BYTES} bytes.`);
  }

  try {
    return JSON.parse(text) as T;
  } catch {
    throw new BodyError(400, "invalid_json", "Request body must be valid JSON.");
  }
}

export class BodyError extends Error {
  constructor(
    readonly status: 400 | 413 | 422,
    readonly code: string,
    message: string,
    readonly details?: unknown,
  ) {
    super(message);
  }
}

export async function secureEqual(left: string, right: string): Promise<boolean> {
  const encoder = new TextEncoder();
  const [leftHash, rightHash] = await Promise.all([
    crypto.subtle.digest("SHA-256", encoder.encode(left)),
    crypto.subtle.digest("SHA-256", encoder.encode(right)),
  ]);
  const a = new Uint8Array(leftHash);
  const b = new Uint8Array(rightHash);
  let difference = left.length === right.length ? 0 : 1;
  for (let index = 0; index < a.length; index += 1) {
    difference |= a[index]! ^ b[index]!;
  }
  return difference === 0;
}
