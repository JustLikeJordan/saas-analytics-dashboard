import { type NextRequest, NextResponse } from 'next/server';
import { webEnv } from '@/lib/config';

export async function POST(request: NextRequest) {
  const body = await request.json();
  const cookieHeader = request.headers.get('cookie') ?? '';

  const response = await fetch(`${webEnv.API_INTERNAL_URL}/auth/callback`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Cookie: cookieHeader,
    },
    body: JSON.stringify(body),
  });

  const data = await response.json();

  const nextResponse = NextResponse.json(data, { status: response.status });
  for (const cookie of response.headers.getSetCookie()) {
    nextResponse.headers.append('Set-Cookie', cookie);
  }
  return nextResponse;
}
