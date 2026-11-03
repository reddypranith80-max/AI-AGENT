"use client";

import { useEffect } from "react";
import { Button } from "@/components/ui/button";

export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);
  return (
    <div role="alert" className="mx-auto flex max-w-md flex-col items-center gap-4 py-24 text-center">
      <h1 className="text-2xl font-bold tracking-tight">Something went wrong</h1>
      <p className="text-muted-foreground">An unexpected error occurred. Your data is safe; try again, and if it keeps happening let us know{error.digest ? ` (ref ${error.digest})` : ""}.</p>
      <Button onClick={reset}>Try again</Button>
    </div>
  );
}
