/**
 * API client for Server Components.
 * Calls the Express API directly via Docker internal networking.
 *
 * NEVER use this in Client Components — use api-client.ts instead.
 */

const API_INTERNAL_URL = process.env.API_INTERNAL_URL ?? 'http://api:3001';

interface ApiResponse<T> {
  data: T;
  meta?: Record<string, unknown>;
}

export async function apiServer<T>(
  path: string,
  options?: RequestInit & { cookies?: string },
): Promise<ApiResponse<T>> {
  const url = `${API_INTERNAL_URL}${path}`;

  const response = await fetch(url, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(options?.cookies ? { Cookie: options.cookies } : {}),
      ...options?.headers,
    },
    cache: 'no-store',
  });

  if (!response.ok) {
    throw new Error(`API error: ${response.status} ${response.statusText}`);
  }

  return response.json() as Promise<ApiResponse<T>>;
}
