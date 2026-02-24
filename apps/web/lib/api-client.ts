/**
 * API client for Client Components.
 * All requests go through the Next.js BFF proxy at /api/*
 * which forwards to the Express API with cookie passthrough.
 *
 * NEVER use this in Server Components — use api-server.ts instead.
 */

const API_BASE = '/api';

interface ApiResponse<T> {
  data: T;
  meta?: Record<string, unknown>;
}

interface ApiError {
  error: {
    code: string;
    message: string;
    details?: unknown;
  };
}

export async function apiClient<T>(
  path: string,
  options?: RequestInit,
): Promise<ApiResponse<T>> {
  const url = `${API_BASE}${path}`;

  const response = await fetch(url, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...options?.headers,
    },
    credentials: 'include',
  });

  if (!response.ok) {
    const errorBody = (await response.json()) as ApiError;
    throw new Error(errorBody.error?.message ?? `API error: ${response.status}`);
  }

  return response.json() as Promise<ApiResponse<T>>;
}
