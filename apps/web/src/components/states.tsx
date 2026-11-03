import { CircleAlert, SearchX } from "lucide-react";
import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { ApiClientError } from "@/lib/client";

export function EmptyState({ icon, title, children, action }: { icon?: ReactNode; title: string; children?: ReactNode; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed px-6 py-14 text-center">
      <div className="grid h-12 w-12 place-items-center rounded-full bg-muted text-muted-foreground">{icon ?? <SearchX className="h-5 w-5" />}</div>
      <h2 className="text-base font-semibold">{title}</h2>
      {children && <p className="max-w-sm text-sm text-muted-foreground">{children}</p>}
      {action}
    </div>
  );
}

/** Friendly copy per error class; offers a retry when it makes sense. */
export function ErrorState({ error, onRetry }: { error: Error; onRetry?: () => void }) {
  const api = error instanceof ApiClientError ? error : null;
  const retryable = api ? api.retryable || api.status === 429 : true;
  return (
    <div role="alert" className="flex flex-col items-center gap-3 rounded-xl border border-destructive/30 bg-destructive/5 px-6 py-12 text-center">
      <div className="grid h-12 w-12 place-items-center rounded-full bg-destructive/10 text-destructive"><CircleAlert className="h-5 w-5" /></div>
      <h2 className="text-base font-semibold">{api?.status === 0 ? "You're offline" : "We couldn't load that"}</h2>
      <p className="max-w-sm text-sm text-muted-foreground">{error.message}</p>
      {onRetry && retryable && <Button variant="outline" onClick={onRetry}>Try again</Button>}
    </div>
  );
}
