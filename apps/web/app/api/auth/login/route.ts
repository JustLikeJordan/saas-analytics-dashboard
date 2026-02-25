import { NextResponse } from 'next/server';
import { webEnv } from '@/lib/config';

export async function GET() {
  const response = await fetch(`${webEnv.API_INTERNAL_URL}/auth/google`);

  if (!response.ok) {
    return NextResponse.json(
      { error: { code: 'AUTH_INIT_FAILED', message: 'Failed to initiate authentication' } },
      { status: 502 },
    );
  }

  const data = await response.json();

  const nextResponse = NextResponse.json(data);
  for (const cookie of response.headers.getSetCookie()) {
    nextResponse.headers.append('Set-Cookie', cookie);
  }
  return nextResponse;
}
