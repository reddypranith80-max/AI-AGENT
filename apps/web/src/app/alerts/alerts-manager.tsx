"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowRight, BellPlus, BellRing, Trash2 } from "lucide-react";
import { createPriceAlertSchema, type PriceAlertView } from "@fh/domain/alerts";
import { CABIN_CLASSES, type CabinClass, type TripType } from "@fh/domain/flights";
import { EmptyState, ErrorState } from "@/components/states";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ApiClientError, fetchJson, firstIssues } from "@/lib/client";
import { cabinLabel, dateOnly, formatMoney, relativeTime } from "@/lib/format";

const CURRENCIES = ["USD", "EUR", "GBP", "INR", "AUD", "CAD", "JPY"];
const digits = (c: string) => new Intl.NumberFormat("en", { style: "currency", currency: c }).resolvedOptions().maximumFractionDigits ?? 2;
const KEY = ["alerts"];

export function AlertsManager({ prefill }: { prefill: Record<string, string | undefined> }) {
  const qc = useQueryClient();
  const [creating, setCreating] = useState(Boolean(prefill.origin));

  const list = useQuery<{ data: PriceAlertView[] }, ApiClientError>({ queryKey: KEY, queryFn: ({ signal }) => fetchJson("/api/alerts", { signal }) });

  const toggle = useMutation<unknown, ApiClientError, { id: string; active: boolean }>({
    mutationFn: ({ id, active }) => fetchJson(`/api/alerts/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ active }) }),
    // Optimistic: flip immediately, roll back on failure.
    onMutate: async ({ id, active }) => {
      await qc.cancelQueries({ queryKey: KEY });
      const prev = qc.getQueryData<{ data: PriceAlertView[] }>(KEY);
      qc.setQueryData<{ data: PriceAlertView[] }>(KEY, (d) => d && { data: d.data.map((a) => (a.id === id ? { ...a, active } : a)) });
      return { prev };
    },
    onError: (_e, _v, ctx) => ctx && qc.setQueryData(KEY, (ctx as { prev?: unknown }).prev),
    onSettled: () => qc.invalidateQueries({ queryKey: KEY }),
  });
  const remove = useMutation<unknown, ApiClientError, string>({
    mutationFn: (id) => fetchJson(`/api/alerts/${id}`, { method: "DELETE" }),
    onSuccess: () => qc.invalidateQueries({ queryKey: KEY }),
  });

  const alerts = list.data?.data ?? [];

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Price alerts</h1>
          <p className="text-sm text-muted-foreground">We check fares regularly and email you when they fall.</p>
        </div>
        {!creating && <Button onClick={() => setCreating(true)}><BellPlus /> New alert</Button>}
      </div>

      {creating && <CreateAlert prefill={prefill} onDone={() => { setCreating(false); void qc.invalidateQueries({ queryKey: KEY }); }} onCancel={() => setCreating(false)} />}

      {list.isLoading && <div className="space-y-3" role="status" aria-label="Loading alerts">{[0, 1].map((i) => <Skeleton key={i} className="h-28 w-full rounded-xl" />)}</div>}
      {list.error && <ErrorState error={list.error} onRetry={() => void list.refetch()} />}
      {!list.isLoading && !list.error && alerts.length === 0 && !creating && (
        <EmptyState icon={<BellRing className="h-5 w-5" />} title="No alerts yet" action={<Button onClick={() => setCreating(true)}><BellPlus /> Create your first alert</Button>}>
          Tell us a route and a target price. We'll watch it for you.
        </EmptyState>
      )}

      <ul className="space-y-3">
        {alerts.map((a) => {
          const down = a.baselineMinor !== null && a.lastSeenMinor !== null && a.lastSeenMinor < a.baselineMinor;
          return (
            <li key={a.id}>
              <Card className={a.active ? "" : "opacity-60"}>
                <div className="flex items-start gap-4 p-4 sm:p-5">
                  <div className="min-w-0 flex-1 space-y-1.5">
                    <h2 className="flex items-center gap-2 text-lg font-semibold tracking-tight">
                      {a.origin} <ArrowRight className="h-4 w-4 text-muted-foreground" aria-hidden /> {a.destination}
                      {!a.active && <Badge variant="secondary">Paused</Badge>}
                    </h2>
                    <p className="text-sm text-muted-foreground">
                      {dateOnly(a.departDate)}{a.returnDate ? ` – ${dateOnly(a.returnDate)}` : " · one way"} · {cabinLabel(a.cabin)} · {a.adults + a.children} traveller{a.adults + a.children > 1 ? "s" : ""}
                    </p>
                    <p className="text-sm">
                      Alert me when{" "}
                      {[a.targetPriceMinor !== null && <strong key="t">≤ {formatMoney(a.targetPriceMinor, a.currency)}</strong>, a.dropPercent !== null && <strong key="d">it drops {a.dropPercent}%</strong>]
                        .filter(Boolean)
                        .flatMap((x, i) => (i ? [" or ", x] : [x]))}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {a.lastSeenMinor !== null ? (
                        <>Lowest now <span className={`font-semibold tabular-nums ${down ? "text-success" : "text-foreground"}`}>{formatMoney(a.lastSeenMinor, a.currency)}</span>
                          {a.baselineMinor !== null && ` (was ${formatMoney(a.baselineMinor, a.currency)} when you set it)`}</>
                      ) : "No fares seen yet"}
                      {a.lastCheckedAt && ` · checked ${relativeTime(Date.parse(a.lastCheckedAt))}`}
                    </p>
                  </div>
                  <div className="flex flex-col items-end gap-3">
                    <Switch checked={a.active} onCheckedChange={(active) => toggle.mutate({ id: a.id, active })} aria-label={`${a.active ? "Pause" : "Resume"} alert ${a.origin} to ${a.destination}`} />
                    <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-destructive" onClick={() => remove.mutate(a.id)} disabled={remove.isPending} aria-label={`Delete alert ${a.origin} to ${a.destination}`}>
                      <Trash2 />
                    </Button>
                  </div>
                </div>
              </Card>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function CreateAlert({ prefill, onDone, onCancel }: { prefill: Record<string, string | undefined>; onDone: () => void; onCancel: () => void }) {
  const [tripType, setTripType] = useState<TripType>(prefill.tripType === "ONE_WAY" ? "ONE_WAY" : "ROUND_TRIP");
  const [cabin, setCabin] = useState<CabinClass>((CABIN_CLASSES as readonly string[]).includes(prefill.cabin ?? "") ? (prefill.cabin as CabinClass) : "ECONOMY");
  const [currency, setCurrency] = useState("USD");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const today = new Date(Date.now() - new Date().getTimezoneOffset() * 60_000).toISOString().slice(0, 10);

  const create = useMutation<unknown, ApiClientError, unknown>({
    mutationFn: (body) => fetchJson("/api/alerts", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }),
    onSuccess: onDone,
    onError: (e) => setErrors({ ...firstIssues(e.issues), form: e.message }),
  });

  function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const num = (k: string) => (String(f.get(k) ?? "").trim() === "" ? undefined : Number(f.get(k)));
    const target = num("target");
    const parsed = createPriceAlertSchema.safeParse({
      tripType,
      origin: f.get("origin"),
      destination: f.get("destination"),
      departDate: f.get("departDate"),
      returnDate: tripType === "ROUND_TRIP" ? f.get("returnDate") || undefined : undefined,
      cabin,
      adults: Number(f.get("adults") || 1),
      children: Number(f.get("children") || 0),
      currency,
      targetPriceMinor: target === undefined ? undefined : Math.round(target * 10 ** digits(currency)),
      dropPercent: num("drop"),
    });
    if (!parsed.success) {
      const issues = firstIssues(parsed.error.flatten().fieldErrors);
      return setErrors({ ...issues, ...(issues.targetPriceMinor ? { target: issues.targetPriceMinor } : {}) });
    }
    setErrors({});
    create.mutate(parsed.data);
  }

  const err = (k: string) => errors[k] && <p role="alert" className="text-xs text-destructive">{errors[k]}</p>;

  return (
    <Card>
      <CardHeader><CardTitle>New price alert</CardTitle></CardHeader>
      <CardContent>
        <form onSubmit={submit} noValidate className="space-y-4">
          <Tabs value={tripType} onValueChange={(v) => setTripType(v as TripType)}>
            <TabsList className="grid w-full grid-cols-2 sm:w-64">
              <TabsTrigger value="ROUND_TRIP">Round trip</TabsTrigger>
              <TabsTrigger value="ONE_WAY">One way</TabsTrigger>
            </TabsList>
          </Tabs>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="a-origin">From</Label>
              <Input id="a-origin" name="origin" maxLength={3} defaultValue={prefill.origin} placeholder="JFK" autoCapitalize="characters" className="uppercase" aria-invalid={!!errors.origin} />
              {err("origin")}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="a-dest">To</Label>
              <Input id="a-dest" name="destination" maxLength={3} defaultValue={prefill.destination} placeholder="LHR" autoCapitalize="characters" className="uppercase" aria-invalid={!!errors.destination} />
              {err("destination")}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="a-depart">Depart</Label>
              <Input id="a-depart" name="departDate" type="date" min={today} defaultValue={prefill.departDate} aria-invalid={!!errors.departDate} />
              {err("departDate")}
            </div>
            {tripType === "ROUND_TRIP" && (
              <div className="space-y-1.5">
                <Label htmlFor="a-return">Return</Label>
                <Input id="a-return" name="returnDate" type="date" min={today} defaultValue={prefill.returnDate} aria-invalid={!!errors.returnDate} />
                {err("returnDate")}
              </div>
            )}
            <div className="space-y-1.5">
              <Label htmlFor="a-adults">Adults</Label>
              <Input id="a-adults" name="adults" type="number" min={1} max={9} defaultValue={prefill.adults ?? 1} />
              {err("adults")}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="a-cabin">Cabin</Label>
              <Select value={cabin} onValueChange={(v) => setCabin(v as CabinClass)}>
                <SelectTrigger id="a-cabin"><SelectValue /></SelectTrigger>
                <SelectContent>{CABIN_CLASSES.map((c) => <SelectItem key={c} value={c}>{cabinLabel(c)}</SelectItem>)}</SelectContent>
              </Select>
            </div>
          </div>
          <input type="hidden" name="children" value={prefill.children ?? "0"} />

          <fieldset className="grid gap-3 rounded-lg border p-3 sm:grid-cols-3">
            <legend className="px-1 text-sm font-medium">Alert me when…</legend>
            <div className="space-y-1.5">
              <Label htmlFor="a-cur">Currency</Label>
              <Select value={currency} onValueChange={setCurrency}>
                <SelectTrigger id="a-cur"><SelectValue /></SelectTrigger>
                <SelectContent>{CURRENCIES.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="a-target">Price is at or below</Label>
              <Input id="a-target" name="target" type="number" min={1} step="any" inputMode="decimal" placeholder="e.g. 550" aria-invalid={!!errors.target} />
              {err("target")}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="a-drop">…or drops by (%)</Label>
              <Input id="a-drop" name="drop" type="number" min={1} max={90} inputMode="numeric" placeholder="e.g. 10" aria-invalid={!!errors.dropPercent} />
              {err("dropPercent")}
            </div>
          </fieldset>

          {errors.form && !Object.keys(errors).some((k) => k !== "form") && <Alert variant="destructive"><AlertDescription>{errors.form}</AlertDescription></Alert>}

          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" onClick={onCancel}>Cancel</Button>
            <Button type="submit" disabled={create.isPending}>{create.isPending ? "Checking current fare…" : "Create alert"}</Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
