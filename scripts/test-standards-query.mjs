import { buildQaCitationBundle } from "../src/standards-query.mjs";

const scenarios = [
  {
    damageCode: "A4",
    context: {
      laminateLayers: 4,
      repairAreaCm2: 280,
      zone: "leading_edge"
    }
  },
  {
    damageCode: "B2",
    context: {
      laminateLayers: 8,
      repairAreaCm2: 950,
      zone: "spar_cap_or_shear_web"
    }
  },
  {
    damageCode: "D2",
    context: {
      laminateLayers: 0,
      repairAreaCm2: 0,
      zone: "full_span_surface"
    }
  }
];

for (const scenario of scenarios) {
  const bundle = await buildQaCitationBundle(scenario.damageCode, scenario.context);
  console.log(JSON.stringify(bundle, null, 2));
}
