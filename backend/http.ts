import { errorCodeFor, publicErrorMessage } from "@backend/errors";

export type ApiSuccess<T> = { success: true; data: T };
export type ApiFailure = {
  success: false;
  error: { code: string; message: string };
};
export type ApiResult<T> = ApiSuccess<T> | ApiFailure;

export function ok<T>(data: T): ApiSuccess<T> {
  return { success: true, data };
}

export function fail(code: string, message: string): ApiFailure {
  return { success: false, error: { code, message } };
}

export async function runController<T>(fn: () => Promise<T>): Promise<ApiResult<T>> {
  try {
    return ok(await fn());
  } catch (error) {
    const message = publicErrorMessage(error);
    return fail(errorCodeFor(error, message), message);
  }
}
