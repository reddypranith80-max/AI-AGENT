"use server";

import { AuthError } from "next-auth";
import { signIn, signOut } from "@/auth";

/** Only same-site relative paths are allowed as post-login destinations (prevents open redirects). */
const safeNext = (next: unknown) => (typeof next === "string" && next.startsWith("/") && !next.startsWith("//") ? next : "/");

export type AuthFormState = { error?: string; sent?: boolean } | undefined;

export async function signInWithEmail(_prev: AuthFormState, form: FormData): Promise<AuthFormState> {
  const email = String(form.get("email") ?? "").trim().toLowerCase();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return { error: "Enter a valid email address." };
  const next = safeNext(form.get("next"));
  const provider = String(form.get("provider") ?? "resend");
  try {
    await signIn(provider, { email, redirectTo: next, redirect: provider === "dev" });
  } catch (e) {
    if (e instanceof AuthError) return { error: "We couldn't sign you in. Please try again." };
    throw e; // Next's redirect is thrown as an error and must propagate
  }
  return { sent: true };
}

export async function signInWithGoogle(form: FormData) {
  await signIn("google", { redirectTo: safeNext(form.get("next")) });
}

export async function signOutAction() {
  await signOut({ redirectTo: "/" });
}
