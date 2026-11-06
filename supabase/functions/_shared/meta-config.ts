// Public dataset identity verified in Events Manager; v27.0 from Meta's current
// Dataset Quality API reference. Override these for a different environment.
export const metaPixel = () =>
  Deno.env.get("META_PIXEL_ID") || "1574733761109578";
export const metaVersion = () => Deno.env.get("META_GRAPH_VERSION") || "v27.0";
