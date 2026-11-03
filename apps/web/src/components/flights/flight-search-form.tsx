"use client";

import { useEffect, useState } from "react";
import { Controller, useForm, type Control } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { ArrowLeftRight, Minus, Plus, Search, Users } from "lucide-react";
import { CABIN_CLASSES, flightSearchSchema, type CabinClass, type FlightSearchInput, type TripType } from "@fh/domain/flights";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cabinLabel } from "@/lib/format";
import { cn } from "@/lib/utils";

const DEFAULTS: FlightSearchInput = {
  tripType: "ROUND_TRIP",
  origin: "",
  destination: "",
  departureDate: "",
  returnDate: undefined,
  adults: 1,
  children: 0,
  infants: 0,
  cabinClass: "ECONOMY",
};

const localIso = (d: Date) => new Date(d.getTime() - d.getTimezoneOffset() * 60_000).toISOString().slice(0, 10);

type Props = {
  defaultValues?: Partial<FlightSearchInput>;
  onSearch: (values: FlightSearchInput) => void;
  loading?: boolean;
  className?: string;
};

export function FlightSearchForm({ defaultValues, onSearch, loading, className }: Props) {
  const {
    control, handleSubmit, watch, setValue, getValues,
    formState: { errors },
  } = useForm<FlightSearchInput>({
    resolver: zodResolver(flightSearchSchema),
    defaultValues: { ...DEFAULTS, ...defaultValues },
  });

  const [tripType, departureDate, adults, children, infants] = watch(["tripType", "departureDate", "adults", "children", "infants"]);

  // Computed after mount: a render-time "today" differs between server and client timezones (hydration warning).
  const [today, setToday] = useState<string>();
  useEffect(() => setToday(localIso(new Date())), []);

  // Moving departure past an already-chosen return clears the return.
  useEffect(() => {
    const r = getValues("returnDate");
    if (r && departureDate && r < departureDate) setValue("returnDate", undefined);
  }, [departureDate, getValues, setValue]);

  const swap = () => {
    const [o, d] = getValues(["origin", "destination"]);
    setValue("origin", d, { shouldDirty: true });
    setValue("destination", o, { shouldDirty: true });
  };

  const travellers = adults + children + infants;

  return (
    <form onSubmit={handleSubmit(onSearch)} noValidate className={cn("space-y-4 rounded-2xl border bg-card p-4 shadow-sm sm:p-6", className)}>
      <Tabs
        value={tripType}
        onValueChange={(v) => {
          setValue("tripType", v as TripType);
          if (v === "ONE_WAY") setValue("returnDate", undefined);
        }}
      >
        <TabsList className="grid h-11 w-full grid-cols-2 sm:w-64">
          <TabsTrigger value="ROUND_TRIP">Round trip</TabsTrigger>
          <TabsTrigger value="ONE_WAY">One way</TabsTrigger>
        </TabsList>
      </Tabs>

      <div className="grid gap-2 sm:grid-cols-[1fr_auto_1fr] sm:items-start sm:gap-3">
        <AirportField control={control} name="origin" label="From" placeholder="JFK" error={errors.origin?.message} />
        <Button type="button" variant="outline" size="icon" onClick={swap} aria-label="Swap origin and destination" className="h-10 w-10 justify-self-center rounded-full sm:mt-7">
          <ArrowLeftRight className="rotate-90 sm:rotate-0" />
        </Button>
        <AirportField control={control} name="destination" label="To" placeholder="LHR" error={errors.destination?.message} />
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="departureDate">Depart</Label>
          <Controller
            control={control}
            name="departureDate"
            render={({ field }) => <Input {...field} id="departureDate" type="date" min={today} aria-invalid={!!errors.departureDate} className="h-12 text-base" />}
          />
          <FieldError msg={errors.departureDate?.message} />
        </div>
        {tripType === "ROUND_TRIP" && (
          <div className="space-y-1.5">
            <Label htmlFor="returnDate">Return</Label>
            <Controller
              control={control}
              name="returnDate"
              render={({ field }) => (
                <Input
                  id="returnDate"
                  type="date"
                  min={departureDate || today}
                  value={field.value ?? ""}
                  onChange={(e) => field.onChange(e.target.value || undefined)}
                  onBlur={field.onBlur}
                  ref={field.ref}
                  aria-invalid={!!errors.returnDate}
                  className="h-12 text-base"
                />
              )}
            />
            <FieldError msg={errors.returnDate?.message} />
          </div>
        )}
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label>Travellers</Label>
          <Popover>
            <PopoverTrigger asChild>
              <Button type="button" variant="outline" className="h-12 w-full justify-start gap-2 text-base font-normal">
                <Users className="text-muted-foreground" />
                {travellers} {travellers === 1 ? "traveller" : "travellers"}
              </Button>
            </PopoverTrigger>
            <PopoverContent align="start">
              <Counter label="Adults" hint="12+ years" value={adults} min={Math.max(1, infants)} max={9 - children} onChange={(n) => setValue("adults", n, { shouldValidate: true })} />
              <Counter label="Children" hint="2–11 years" value={children} min={0} max={9 - adults} onChange={(n) => setValue("children", n, { shouldValidate: true })} />
              <Counter label="Infants" hint="Under 2, on lap" value={infants} min={0} max={Math.min(adults, 4)} onChange={(n) => setValue("infants", n, { shouldValidate: true })} />
            </PopoverContent>
          </Popover>
          <FieldError msg={errors.adults?.message ?? errors.infants?.message} />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="cabinClass">Cabin</Label>
          <Controller
            control={control}
            name="cabinClass"
            render={({ field }) => (
              <Select value={field.value} onValueChange={field.onChange}>
                <SelectTrigger id="cabinClass" className="h-12 text-base">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {CABIN_CLASSES.map((c: CabinClass) => (
                    <SelectItem key={c} value={c}>{cabinLabel(c)}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          />
        </div>
      </div>

      <Button type="submit" size="lg" disabled={loading} className="w-full">
        <Search />
        {loading ? "Searching…" : "Search flights"}
      </Button>
    </form>
  );
}

function FieldError({ msg }: { msg?: string }) {
  return msg ? <p role="alert" className="text-xs text-destructive">{msg}</p> : null;
}

function AirportField({
  control, name, label, placeholder, error,
}: {
  control: Control<FlightSearchInput>;
  name: "origin" | "destination";
  label: string;
  placeholder: string;
  error?: string;
}) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={name}>{label}</Label>
      <Controller
        control={control}
        name={name}
        render={({ field }) => (
          <Input
            {...field}
            id={name}
            placeholder={placeholder}
            maxLength={3}
            autoComplete="off"
            autoCapitalize="characters"
            spellCheck={false}
            aria-invalid={!!error}
            // text-base (16px) stops iOS Safari zooming the page on focus
            className="h-12 text-base font-medium uppercase tracking-widest"
            onChange={(e) => field.onChange(e.target.value.toUpperCase().replace(/[^A-Z]/g, ""))}
          />
        )}
      />
      <FieldError msg={error} />
    </div>
  );
}

function Counter({ label, hint, value, min, max, onChange }: { label: string; hint: string; value: number; min: number; max: number; onChange: (n: number) => void }) {
  return (
    <div className="flex items-center justify-between py-2">
      <div>
        <p className="text-sm font-medium">{label}</p>
        <p className="text-xs text-muted-foreground">{hint}</p>
      </div>
      <div className="flex items-center gap-3">
        <Button type="button" variant="outline" size="icon" className="h-9 w-9 rounded-full" disabled={value <= min} onClick={() => onChange(value - 1)} aria-label={`Fewer ${label.toLowerCase()}`}>
          <Minus />
        </Button>
        <span className="w-5 text-center tabular-nums" aria-live="polite">{value}</span>
        <Button type="button" variant="outline" size="icon" className="h-9 w-9 rounded-full" disabled={value >= max} onClick={() => onChange(value + 1)} aria-label={`More ${label.toLowerCase()}`}>
          <Plus />
        </Button>
      </div>
    </div>
  );
}
