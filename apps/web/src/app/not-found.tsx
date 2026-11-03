import Link from "next/link";
import { Button } from "@/components/ui/button";

export default function NotFound() {
  return (
    <div className="mx-auto flex max-w-md flex-col items-center gap-4 py-24 text-center">
      <p className="text-5xl font-bold text-muted-foreground">404</p>
      <h1 className="text-2xl font-bold tracking-tight">We couldn't find that page</h1>
      <p className="text-muted-foreground">It may have moved, or the link is out of date.</p>
      <Button asChild><Link href="/">Back to search</Link></Button>
    </div>
  );
}
