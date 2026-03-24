import { type NextRequest, NextResponse } from "next/server";
import { webEnv } from "@/lib/config";

export async function POST(request: NextRequest) {
  const cookieHeader = request.headers.get("cookie") ?? "";
  const body = await request.text();

  const response = await fetch(`${webEnv.API_INTERNAL_URL}/shares`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Cookie: cookieHeader,
    },
    body,
  });

  const data = await response.json();
  return NextResponse.json(data, { status: response.status });
}
