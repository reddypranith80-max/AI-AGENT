import Link from "next/link";
import { Plane } from "lucide-react";
import { auth } from "@/auth";
import { signOutAction } from "@/app/actions";
import { Button } from "@/components/ui/button";
import { NavLinks } from "./nav-links";
import { ThemeToggle } from "./theme-toggle";

export async function SiteHeader() {
  const session = await auth();
  const user = session?.user;

  return (
    <header className="sticky top-0 z-40 border-b bg-background/80 backdrop-blur supports-[backdrop-filter]:bg-background/70">
      <div className="container flex h-14 items-center gap-4">
        <Link href="/" className="flex items-center gap-2 font-semibold tracking-tight" aria-label="Flight Hotel home">
          <span className="grid h-7 w-7 place-items-center rounded-lg bg-primary text-primary-foreground">
            <Plane className="h-4 w-4 -rotate-45" aria-hidden />
          </span>
          <span className="hidden sm:inline">Flight Hotel</span>
        </Link>

        <NavLinks className="ml-4 hidden sm:flex" />

        <div className="ml-auto flex items-center gap-2">
          <ThemeToggle />
          {user ? (
            <div className="flex items-center gap-2">
              <span className="hidden max-w-[10rem] truncate text-sm text-muted-foreground md:inline" title={user.email ?? undefined}>
                {user.email}
              </span>
              <form action={signOutAction}>
                <Button variant="outline" size="sm" type="submit">Sign out</Button>
              </form>
            </div>
          ) : (
            <Button asChild size="sm">
              <Link href="/login">Sign in</Link>
            </Button>
          )}
        </div>
      </div>
    </header>
  );
}
