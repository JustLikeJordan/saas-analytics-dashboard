import { type NextRequest, NextResponse } from 'next/server';
import { webEnv } from '@/lib/config';

export async function GET(request: NextRequest) {
  const cookieHeader = request.headers.get('cookie') ?? '';

  try {
    const response = await fetch(`${webEnv.API_INTERNAL_URL}/admin/health`, {
      headers: { Cookie: cookieHeader },
    });

    const data = await response.json();
    return NextResponse.json(data, { status: response.status });
  } catch {
    return NextResponse.json(
      { error: { code: 'UPSTREAM_UNAVAILABLE', message: 'API server unreachable' } },
      { status: 502 },
    );
  }
}
