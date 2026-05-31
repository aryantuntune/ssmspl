import { NextRequest, NextResponse } from "next/server";

const CUSTOMER_PUBLIC = [
  "/customer/login",
  "/customer/register",
  "/customer/verify-email",
  "/customer/forgot-password",
  "/customer/reset-password",
  // The payment result screen is reached via a redirect back from Airpay. It
  // only reads query params (status/booking_id) and shows success/failure, so
  // it must render even if the auth cookie is momentarily unavailable on the
  // cross-site return — otherwise the customer gets bounced to login instead of
  // seeing their confirmation. Links from here (View Booking) go to protected
  // routes that re-check auth normally.
  "/customer/payment/callback",
];

const ADMIN_PORTAL_ALLOWED = [
  "/login",
  "/forgot-password",
  "/reset-password",
  "/dashboard",
];

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Admin portal mode: block public site and customer portal routes
  if (process.env.NEXT_PUBLIC_ADMIN_PORTAL === "true") {
    const isAllowed = ADMIN_PORTAL_ALLOWED.some(
      (p) => pathname === p || pathname.startsWith(p + "/")
    );
    if (!isAllowed) {
      return NextResponse.redirect(new URL("/login", request.url));
    }
  }

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
