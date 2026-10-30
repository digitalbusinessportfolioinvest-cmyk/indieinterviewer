import { NextResponse, type NextRequest } from "next/server";

// Cheap gate: admin pages need a session cookie. The session itself is
// validated against the database in each admin page and server action.
export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  if (pathname.startsWith("/admin") && pathname !== "/admin/login" && !req.cookies.get("ii_session")) {
    return NextResponse.redirect(new URL("/admin/login", req.url));
  }
  const res = NextResponse.next();
  res.headers.set("X-Robots-Tag", "noindex, nofollow");
  res.headers.set("Referrer-Policy", "no-referrer");
  return res;
}

export const config = { matcher: ["/((?!_next/static|_next/image|favicon).*)"] };
