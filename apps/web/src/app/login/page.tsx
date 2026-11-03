import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { auth, devLoginEnabled } from "@/auth";
import { signInWithGoogle } from "@/app/actions";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { EmailSignInForm } from "./email-form";

export const metadata: Metadata = { title: "Sign in" };

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const { next } = await searchParams;
  const dest = next && next.startsWith("/") && !next.startsWith("//") ? next : "/";
  if ((await auth())?.user) redirect(dest);

  const hasGoogle = Boolean(process.env.AUTH_GOOGLE_ID);
  const hasEmail = Boolean(process.env.RESEND_API_KEY);

  return (
    <div className="mx-auto max-w-sm pt-8 sm:pt-16">
      <Card>
        <CardHeader>
          <CardTitle className="text-xl">Sign in</CardTitle>
          <CardDescription>
            {hasEmail ? "We'll email you a magic link. No password needed." : "Enter your email to continue."}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {hasGoogle && (
            <form action={signInWithGoogle}>
              <input type="hidden" name="next" value={dest} />
              <Button variant="outline" className="w-full" type="submit">Continue with Google</Button>
            </form>
          )}
          {(hasEmail || devLoginEnabled) && <EmailSignInForm next={dest} provider={hasEmail ? "resend" : "dev"} />}
          {!hasEmail && !devLoginEnabled && !hasGoogle && (
            <p className="text-sm text-muted-foreground">
              No sign-in method is configured. Set <code>AUTH_DEV_LOGIN=true</code> for local development, or add Resend/Google credentials.
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
