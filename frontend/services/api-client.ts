import type { ApiResult } from "@backend/http";

export function unwrapApi<T>(result: ApiResult<T>): T {
  if (!result.success) {
    throw new Error(result.error.message);
  }
  return result.data;
}
