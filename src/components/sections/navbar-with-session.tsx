import { auth } from "@/auth";
import { Navbar } from "./navbar";

/**
 * Thin async Server Component wrapper — resolves the real session server-
 * side and passes it down as a plain prop, exactly like
 * src/app/dashboard/layout.tsx does for ProfileMenu. Keeps Navbar itself a
 * pure "use client" leaf (scroll state, mobile menu, product dropdown,
 * theme toggle) with no session-fetching logic of its own — this codebase
 * has no <SessionProvider>/useSession() anywhere, so this mirrors the one
 * pattern that's actually proven here instead of introducing a new one.
 */
export async function NavbarWithSession() {
  const session = await auth();
  const user = session?.user ? { name: session.user.name ?? null, email: session.user.email ?? null } : null;
  return <Navbar user={user} />;
}
