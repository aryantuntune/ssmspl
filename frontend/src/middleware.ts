import { NextRequest, NextResponse } from "next/server";

const ADMIN_PROTECTED_PATHS = ["/dashboard"];
const CUSTOMER_PROTECTED_PATHS = [
  "/customer/dashboard",
  "/customer/history",
  "/customer/bookings",
];

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Check admin protected routes
  if (ADMIN_PROTECTED_PATHS.some((path) => pathname.startsWith(path))) {
    const accessToken = request.cookies.get("ssmspl_access_token");
    if (!accessToken?.value) {
      const loginUrl = new URL("/login", request.url);
      loginUrl.searchParams.set("redirect", pathname);
      return NextResponse.redirect(loginUrl);
    }
  }

  // Check customer protected routes
  if (CUSTOMER_PROTECTED_PATHS.some((path) => pathname.startsWith(path))) {
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
