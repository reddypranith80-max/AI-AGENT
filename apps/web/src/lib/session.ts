import "server-only";
import { redirect } from "next/navigation";
import { auth } from "@/auth";

export async function getUserId(): Promise<string | null> {
  return (await auth())?.user?.id ?? null;
}

/** For pages: bounces to /login (preserving the destination) when signed out. */
export async function requireUser(next: string): Promise<string> {
  const id = await getUserId();
  if (!id) redirect(`/login?next=${encodeURIComponent(next)}`);
  return id;
}
