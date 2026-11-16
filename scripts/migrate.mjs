// Applies supabase/migrations/NNNN_*.sql files the database hasn't seen yet, in order, and records each one.
// Usage: source ~/.supabase/token.env && npm run db:migrate
import { readdirSync, readFileSync } from "node:fs";

const REF = "bjndslreyjmfaocuffsj";
const token = process.env.SUPABASE_ACCESS_TOKEN;
if (!token) throw new Error("Set SUPABASE_ACCESS_TOKEN (source ~/.supabase/token.env)");

async function sql(query) {
  const res = await fetch(`https://api.supabase.com/v1/projects/${REF}/database/query`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ query }),
  });
  const body = await res.json();
  if (!res.ok) throw new Error(body.message ?? JSON.stringify(body));
  return body;
}

const applied = new Set((await sql("select version from supabase_migrations.schema_migrations")).map((r) => r.version));
const dir = new URL("../supabase/migrations/", import.meta.url);
const files = readdirSync(dir).filter((f) => /^\d{4}_.+\.sql$/.test(f)).sort();

let n = 0;
for (const f of files) {
  const [version, ...rest] = f.replace(/\.sql$/, "").split("_");
  if (applied.has(version)) continue;
  // Run the file and record it in one transaction, so a failure leaves nothing half-applied or wrongly recorded.
  const name = rest.join("_").replace(/'/g, "");
  await sql(`begin;\n${readFileSync(new URL(f, dir), "utf8")}\ninsert into supabase_migrations.schema_migrations (version, name) values ('${version}', '${name}');\ncommit;`);
  console.log(`applied ${f}`);
  n++;
}
console.log(n ? `${n} migration(s) applied` : "database is up to date");
