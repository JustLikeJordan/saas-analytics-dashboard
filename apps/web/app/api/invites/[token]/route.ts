import { type NextRequest, NextResponse } from 'next/server';
import { webEnv } from '@/lib/config';

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params;

  const response = await fetch(`${webEnv.API_INTERNAL_URL}/invites/${token}`);
  const data = await response.json();

  return NextResponse.json(data, { status: response.status });
}
