import { type NextRequest, NextResponse } from 'next/server';
import { webEnv } from '@/lib/config';

export async function POST(request: NextRequest) {
  const cookieHeader = request.headers.get('cookie') ?? '';

  const response = await fetch(`${webEnv.API_INTERNAL_URL}/auth/logout`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Cookie: cookieHeader,
    },
  });

  const data = await response.json();

  const nextResponse = NextResponse.json(data, { status: response.status });
  for (const cookie of response.headers.getSetCookie()) {
    nextResponse.headers.append('Set-Cookie', cookie);
  }
  return nextResponse;
}
