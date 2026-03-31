import { type NextRequest, NextResponse } from 'next/server';
import { webEnv } from '@/lib/config';

export async function GET(request: NextRequest) {
  const cookieHeader = request.headers.get('cookie') ?? '';

  const response = await fetch(`${webEnv.API_INTERNAL_URL}/admin/users`, {
    headers: { Cookie: cookieHeader },
  });

  const data = await response.json();
  return NextResponse.json(data, { status: response.status });
}
