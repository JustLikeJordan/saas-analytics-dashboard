import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { webEnv } from '@/lib/config';

export const runtime = 'nodejs';

/**
 * Explicit BFF handler for CSV uploads. Next.js rewrites exist but don't
 * reliably forward cookies or multipart boundaries. This handler streams
 * the raw multipart body to Express and returns the response verbatim.
 */
export async function POST(request: NextRequest) {
  const contentType = request.headers.get('content-type') || '';
  const cookie = request.headers.get('cookie') || '';

  const response = await fetch(`${webEnv.API_INTERNAL_URL}/datasets`, {
    method: 'POST',
    headers: {
      'content-type': contentType,
      cookie,
    },
    body: request.body,
    duplex: 'half',
  } as RequestInit);

  const data = await response.json();

  const nextResponse = NextResponse.json(data, { status: response.status });

  // Forward Set-Cookie headers (token refresh may happen on any auth request)
  for (const setCookie of response.headers.getSetCookie()) {
    nextResponse.headers.append('Set-Cookie', setCookie);
  }

  return nextResponse;
}
