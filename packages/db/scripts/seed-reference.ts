/**
 * Seeds airports + airlines from the OpenFlights dataset.
 *   pnpm --filter @fh/db seed:reference            # writes to DATABASE_URL
 *   pnpm --filter @fh/db seed:reference -- --dry   # parse + print counts only
 */
import { PrismaClient } from "@prisma/client";

const BASE = "https://raw.githubusercontent.com/jpatokal/openflights/master/data";
const DRY = process.argv.includes("--dry");

/** Minimal CSV line parser (OpenFlights uses quoted fields with embedded commas). */
function parseLine(line: string): string[] {
  const out: string[] = [];
  let cur = "", q = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (q) {
      if (c === '"' && line[i + 1] === '"') { cur += '"'; i++; }
      else if (c === '"') q = false;
      else cur += c;
    } else if (c === '"') q = true;
    else if (c === ",") { out.push(cur); cur = ""; }
    else cur += c;
  }
  out.push(cur);
  return out;
}

const get = async (file: string) => {
  const res = await fetch(`${BASE}/${file}`);
  if (!res.ok) throw new Error(`${file}: HTTP ${res.status}`);
  return (await res.text()).split(/\r?\n/).filter(Boolean).map(parseLine);
};
const clean = (s: string | undefined) => (s && s !== "\N" && s !== "-" ? s : null);

async function main() {
  const [countries, airports, airlines] = await Promise.all([get("countries.dat"), get("airports.dat"), get("airlines.dat")]);
  const iso = new Map(countries.map((c) => [c[0], c[1]])); // name → ISO-2

  const airportRows = airports.flatMap((r) => {
    const [, name, city, country, iata, icao, lat, lon, , , , tz, type] = r;
    const code = clean(iata);
    const zone = clean(tz);
    if (!code || code.length !== 3 || !zone || type !== "airport") return [];
    return [{ iata: code, icao: clean(icao), name, city: city || name, countryCode: iso.get(country) ?? "ZZ", latitude: Number(lat), longitude: Number(lon), timezone: zone }];
  });

  const seen = new Set<string>();
  const airlineRows = airlines.flatMap((r) => {
    const [, name, , iata, icao, , , active] = r;
    const code = clean(iata);
    if (!code || code.length !== 2 || active !== "Y" || seen.has(code)) return [];
    seen.add(code);
    return [{ iata: code, icao: clean(icao), name, active: true }];
  });

  console.log(`airports: ${airportRows.length}, airlines: ${airlineRows.length}`);
  if (DRY) {
    console.log("sample airport:", airportRows.find((a) => a.iata === "LHR"));
    console.log("sample airline:", airlineRows.find((a) => a.iata === "BA"));
    return;
  }

  const prisma = new PrismaClient();
  const dedupeIcao = <T extends { icao: string | null }>(rows: T[]) => {
    const used = new Set<string>();
    return rows.map((r) => (r.icao && used.has(r.icao) ? { ...r, icao: null } : (r.icao && used.add(r.icao), r)));
  };
  // Upsert overwrites placeholder rows created by ensureAirports().
  for (const a of dedupeIcao(airportRows)) {
    await prisma.airport.upsert({ where: { iata: a.iata }, create: a, update: a });
  }
  for (const a of dedupeIcao(airlineRows)) {
    await prisma.airline.upsert({ where: { iata: a.iata }, create: a, update: a });
  }
  await prisma.$disconnect();
  console.log("done");
}

main().catch((e) => { console.error(e); process.exit(1); });
