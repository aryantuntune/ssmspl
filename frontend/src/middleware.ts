import { NextRequest, NextResponse } from "next/server";

const CUSTOMER_PUBLIC = [
  "/customer/login",
  "/customer/register",
  "/customer/forgot-password",
  "/customer/reset-password",
];

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Protect ALL /dashboard/* routes
  if (pathname.startsWith("/dashboard")) {
    const accessToken = request.cookies.get("ssmspl_access_token");
    if (!accessToken?.value) {
      const loginUrl = new URL("/login", request.url);
      loginUrl.searchParams.set("redirect", pathname);
      return NextResponse.redirect(loginUrl);
    }
  }

  // Protect ALL /customer/* routes (except login, register, forgot/reset password)
  if (
    pathname.startsWith("/customer") &&
    !CUSTOMER_PUBLIC.some((p) => pathname.startsWith(p))
  ) {
    const portalToken = request.cookies.get("ssmspl_portal_access_token");
    if (!portalToken?.value) {
      const loginUrl = new URL("/customer/login", request.url);
      loginUrl.searchParams.set("redirect", pathname);
      return NextResponse.redirect(loginUrl);
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|images|videos|favicon\\.ico|api).*)",
  ],
};
