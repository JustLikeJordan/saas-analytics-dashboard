import { type NextRequest, NextResponse } from 'next/server';
import { webEnv } from '@/lib/config';

export async function GET(request: NextRequest) {
  const cookieHeader = request.headers.get('cookie') ?? '';

  // existing BFF proxies don't forward query params — this one must
  const search = request.nextUrl.search;
  const response = await fetch(`${webEnv.API_INTERNAL_URL}/admin/analytics-events${search}`, {
    headers: { Cookie: cookieHeader },
  });

  const data = await response.json();
  return NextResponse.json(data, { status: response.status });
}
