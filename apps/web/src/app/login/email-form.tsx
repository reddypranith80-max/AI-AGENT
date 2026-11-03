"use client";

import { useActionState } from "react";
import { MailCheck } from "lucide-react";
import { signInWithEmail } from "@/app/actions";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function EmailSignInForm({ next, provider }: { next: string; provider: "resend" | "dev" }) {
  const [state, action, pending] = useActionState(signInWithEmail, undefined);

  if (state?.sent)
    return (
      <Alert variant="success">
        <AlertDescription className="flex items-center gap-2"><MailCheck className="h-4 w-4" /> Check your inbox for a sign-in link.</AlertDescription>
      </Alert>
    );

  return (
    <form action={action} className="space-y-3" noValidate>
      <input type="hidden" name="next" value={next} />
      <input type="hidden" name="provider" value={provider} />
      <div className="space-y-1.5">
        <Label htmlFor="email">Email</Label>
        <Input id="email" name="email" type="email" autoComplete="email" inputMode="email" placeholder="you@example.com" required aria-invalid={!!state?.error} aria-describedby={state?.error ? "email-error" : undefined} />
        {state?.error && <p id="email-error" role="alert" className="text-xs text-destructive">{state.error}</p>}
      </div>
      <Button type="submit" className="w-full" disabled={pending}>
        {pending ? "Signing in…" : provider === "dev" ? "Continue (dev login)" : "Email me a link"}
      </Button>
    </form>
  );
}
