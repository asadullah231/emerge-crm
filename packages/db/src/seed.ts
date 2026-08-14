/**
 * Performance seed: creates a throwaway workspace with 1,000 companies and
 * 10,000 contacts so list pages can be exercised at production-like volume.
 *
 *   export DATABASE_URL=... && pnpm --filter @emerge/db seed
 *
 * Every run creates a fresh "Perf Seed" workspace; drop it by deleting the
 * workspace row (tenant rows cascade).
 */
import { createDb, companies, contacts, memberships, users, workspaces } from "./index";

const COMPANY_COUNT = 1_000;
const CONTACT_COUNT = 10_000;
const BATCH = 1_000;

const FIRST = [
  "Anna",
  "Ben",
  "Clara",
  "David",
  "Eva",
  "Felix",
  "Greta",
  "Hans",
  "Iris",
  "Jonas",
  "Katrin",
  "Lukas",
  "Mia",
  "Nico",
  "Olga",
  "Paul",
  "Quinn",
  "Rosa",
  "Stefan",
  "Tara"
];
const LAST = [
  "Mueller",
  "Schmidt",
  "Schneider",
  "Fischer",
  "Weber",
  "Meyer",
  "Wagner",
  "Becker",
  "Schulz",
  "Hoffmann",
  "Koch",
  "Bauer",
  "Richter",
  "Klein",
  "Wolf",
  "Neumann",
  "Braun",
  "Krueger",
  "Hofmann",
  "Lange"
];
const COMPANY_A = [
  "Alpine",
  "Nord",
  "Delta",
  "Vertex",
  "Prime",
  "Atlas",
  "Nova",
  "Summit",
  "Core",
  "Bright",
  "Swift",
  "Solid",
  "Metro",
  "Global",
  "First",
  "United",
  "Central",
  "Modern",
  "Digital",
  "Rapid"
];
const COMPANY_B = [
  "Consulting",
  "Engineering",
  "Logistics",
  "Systems",
  "Manufacturing",
  "Solutions",
  "Partners",
  "Industries",
  "Automotive",
  "Technologies",
  "Group",
  "Services",
  "Dynamics",
  "Works",
  "Labs",
  "Holdings",
  "Media",
  "Energy",
  "Capital",
  "Networks"
];
const INDUSTRIES = [
  "Automotive",
  "Consulting",
  "Manufacturing",
  "Logistics",
  "Software",
  "Energy",
  "Finance",
  "Healthcare",
  "Retail",
  "Construction"
];
const CITIES = [
  "Munich, Germany",
  "Stuttgart, Germany",
  "Berlin, Germany",
  "Vienna, Austria",
  "Zurich, Switzerland",
  "Hamburg, Germany",
  "Frankfurt, Germany",
  "London, UK",
  "Amsterdam, Netherlands",
  "Paris, France"
];
const TITLES = [
  "Head of HR",
  "Talent Acquisition Manager",
  "HR Business Partner",
  "Managing Director",
  "Recruiting Lead",
  "People Operations Manager",
  "CEO",
  "COO",
  "Engineering Manager",
  "Plant Manager"
];
const STATUSES = ["prospect", "active", "dormant"] as const;

// Deterministic PRNG so repeated runs produce comparable data shapes.
function mulberry32(seed: number) {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

async function main() {
  const db = createDb();
  const rand = mulberry32(42);
  const pick = <T>(arr: readonly T[]) => arr[Math.floor(rand() * arr.length)]!;

  const started = Date.now();
  const [ws] = await db
    .insert(workspaces)
    .values({ name: `Perf Seed ${new Date().toISOString().slice(0, 16)}` })
    .returning();
  if (!ws) throw new Error("workspace insert failed");

  const [owner] = await db
    .insert(users)
    .values({
      email: `perf-seed-${Date.now()}@test.local`,
      name: "Perf Seed Admin",
      passwordHash: "not-a-login"
    })
    .returning();
  if (!owner) throw new Error("user insert failed");
  await db.insert(memberships).values({ workspaceId: ws.id, userId: owner.id, role: "admin" });

  const companyIds: string[] = [];
  for (let offset = 0; offset < COMPANY_COUNT; offset += BATCH) {
    const values = Array.from({ length: Math.min(BATCH, COMPANY_COUNT - offset) }, (_, i) => {
      const n = offset + i;
      const name = `${pick(COMPANY_A)} ${pick(COMPANY_B)} ${n}`;
      const domain = `${name.toLowerCase().replace(/\s+/g, "-")}.example.com`;
      return {
        workspaceId: ws.id,
        name,
        website: `https://${domain}`,
        domain,
        industry: pick(INDUSTRIES),
        location: pick(CITIES),
        status: pick(STATUSES),
        ownerId: owner.id
      };
    });
    const rows = await db.insert(companies).values(values).returning({ id: companies.id });
    companyIds.push(...rows.map((r) => r.id));
    console.log(`companies: ${companyIds.length}/${COMPANY_COUNT}`);
  }

  let contactCount = 0;
  for (let offset = 0; offset < CONTACT_COUNT; offset += BATCH) {
    const values = Array.from({ length: Math.min(BATCH, CONTACT_COUNT - offset) }, (_, i) => {
      const n = offset + i;
      const firstName = pick(FIRST);
      const lastName = pick(LAST);
      return {
        workspaceId: ws.id,
        firstName,
        lastName,
        title: pick(TITLES),
        email: `${firstName.toLowerCase()}.${lastName.toLowerCase()}.${n}@seed.example.com`,
        // ~10% independent contacts, mirroring real data where some contacts
        // are not attached to a client yet.
        companyId: rand() < 0.1 ? null : pick(companyIds),
        ownerId: owner.id
      };
    });
    await db.insert(contacts).values(values);
    contactCount += values.length;
    console.log(`contacts: ${contactCount}/${CONTACT_COUNT}`);
  }

  console.log(
    `Seeded workspace "${ws.name}" (${ws.id}) with ${companyIds.length} companies and ` +
      `${contactCount} contacts in ${((Date.now() - started) / 1000).toFixed(1)}s`
  );
  await db.close();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
