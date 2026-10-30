/**
 * Valida todos los planes de src/content/planes contra el esquema.
 * Sale con código 1 si hay algún error, para que falle el build.
 * Con --reporte imprime el estado de verificación de cada plan.
 */
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { PlanSchema, type Plan } from "../src/lib/schema";

const DIR = join(import.meta.dirname, "..", "src", "content", "planes");
const files = readdirSync(DIR).filter((f) => f.endsWith(".json")).sort();

const errores: string[] = [];
const planes: Plan[] = [];
const ids = new Map<string, string>();
const slugs = new Map<string, string>();

for (const f of files) {
  let raw: unknown;
  try {
    raw = JSON.parse(readFileSync(join(DIR, f), "utf8"));
  } catch (e) {
    errores.push(`${f}: JSON inválido (${(e as Error).message})`);
    continue;
  }
  const r = PlanSchema.safeParse(raw);
  if (!r.success) {
    for (const i of r.error.issues) errores.push(`${f}: ${i.path.join(".") || "(raíz)"}: ${i.message}`);
    continue;
  }
  const p = r.data;
  if (`${p.slug}.json` !== f) errores.push(`${f}: el slug '${p.slug}' no coincide con el nombre del archivo`);
  if (ids.has(p.id)) errores.push(`${f}: id '${p.id}' repetido en ${ids.get(p.id)}`);
  if (slugs.has(p.slug)) errores.push(`${f}: slug '${p.slug}' repetido en ${slugs.get(p.slug)}`);
  ids.set(p.id, f);
  slugs.set(p.slug, f);
  planes.push(p);
}

if (errores.length) {
  console.error(`\n✖ ${errores.length} error(es) de validación:\n`);
  for (const e of errores) console.error("  - " + e);
  process.exit(1);
}

console.log(`✔ ${planes.length} planes válidos`);

if (process.argv.includes("--reporte")) {
  const verificados = planes.filter((p) => p.verificado).length;
  console.log(`\nVerificados: ${verificados}/${planes.length}`);
  const conteo: Record<string, number> = {};
  for (const p of planes) for (const c of p.pendientes) conteo[c] = (conteo[c] ?? 0) + 1;
  console.log("Campos pendientes (planes afectados):", conteo);
  console.log("\nPlanes con precio confirmado:");
  for (const p of planes.filter((p) => p.precio.tipo !== "por_confirmar")) console.log(`  - ${p.slug}: ${p.precio.tipo}`);
}
