import { NextResponse } from "next/server";

export async function middleware() {
  // Simple middleware - just pass through all requests
  // Cache logic is now handled directly in the API routes
  return NextResponse.next();
}

export const config = {
  matcher: "/api/:path*",
};
