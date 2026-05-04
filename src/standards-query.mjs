import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const packPath = path.resolve(__dirname, "..", "knowledge", "standards", "standards-pack.json");

let cachedPack;

async function loadPack() {
  if (!cachedPack) {
    cachedPack = JSON.parse(await fs.readFile(packPath, "utf8"));
  }
  return cachedPack;
}

function normalizeZone(zone) {
  return String(zone || "").trim().toLowerCase().replaceAll(" ", "_");
}

function evaluateGwoScope(pack, context = {}) {
  const gwo = pack.gates.gwo_scope;
  const layers = Number(context.laminateLayers ?? 0);
  const areaCm2 = Number(context.repairAreaCm2 ?? 0);
  const zone = normalizeZone(context.zone);
  const reasons = [];

  if (layers > gwo.max_laminate_layers) {
    reasons.push(`laminate layers ${layers} exceed GWO limit ${gwo.max_laminate_layers}`);
  }
  if (areaCm2 > gwo.max_repair_area_cm2) {
    reasons.push(`repair area ${areaCm2} cm2 exceeds GWO limit ${gwo.max_repair_area_cm2} cm2`);
  }
  if (zone && gwo.restricted_zones.includes(zone)) {
    reasons.push(`zone ${zone} is treated as a restricted structural zone`);
  }

  return {
    withinScope: reasons.length === 0,
    reasons,
    rule: gwo.rule
  };
}

function findTier(pack, repairCode) {
  return pack.complexity_tiers.find((tier) => tier.repair_codes.includes(repairCode)) ?? null;
}

function uniqueBy(array, keyFn) {
  const seen = new Set();
  return array.filter((item) => {
    const key = keyFn(item);
    if (seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
}

export async function getDamageKnowledge(damageCode, context = {}) {
  const pack = await loadPack();
  const damage = pack.taxonomy.find((item) => item.damage_code === damageCode);
  if (!damage) {
    throw new Error(`Unknown damage code: ${damageCode}`);
  }

  const gwoDecision = evaluateGwoScope(pack, context);
  const mappingRows = pack.mappings.filter((item) => item.damage_code === damageCode);
  const standards = uniqueBy(
    mappingRows.flatMap((mapping) =>
      mapping.standard_codes.map((standardCode) => pack.standards.find((standard) => standard.standard_code === standardCode))
    ).filter(Boolean),
    (item) => item.standard_code
  );

  const excerpts = standards.flatMap((standard) =>
    standard.requirements
      .filter((requirement) => requirement.damage_codes.includes(damageCode))
      .map((requirement) => ({
        standard_code: standard.standard_code,
        standard_title: standard.title,
        citation: requirement.citation,
        excerpt: requirement.excerpt
      }))
  );

  const repairs = mappingRows.map((mapping) => ({
    repair_code: mapping.recommended_repair_code,
    repair_name: mapping.repair_name,
    complexity_tier: mapping.complexity_tier,
    tier_detail: findTier(pack, mapping.recommended_repair_code),
    default_scope: mapping.default_scope,
    approval_required: mapping.approval_required,
    standard_codes: mapping.standard_codes
  }));

  return {
    damage,
    context,
    gwo_scope: gwoDecision,
    repairs: uniqueBy(repairs, (item) => item.repair_code),
    standards: standards.map((standard) => ({
      standard_code: standard.standard_code,
      title: standard.title,
      issuing_body: standard.issuing_body,
      version_label: standard.version_label,
      summary: standard.summary,
      document_uri: standard.document_uri
    })),
    excerpts
  };
}

export async function buildQaCitationBundle(damageCode, context = {}) {
  const result = await getDamageKnowledge(damageCode, context);
  return {
    damage_code: result.damage.damage_code,
    damage_label: result.damage.damage_label,
    recommended_repairs: result.repairs.map((repair) => ({
      repair_code: repair.repair_code,
      repair_name: repair.repair_name,
      complexity_tier: repair.complexity_tier
    })),
    gwo_scope: result.gwo_scope,
    citations: result.excerpts.map((excerpt) => ({
      standard_code: excerpt.standard_code,
      citation: excerpt.citation,
      excerpt: excerpt.excerpt
    }))
  };
}
