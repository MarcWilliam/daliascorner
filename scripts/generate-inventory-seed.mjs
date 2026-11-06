import { readFileSync, writeFileSync } from "node:fs";
const data = JSON.parse(
  readFileSync(new URL("../lib/products.json", import.meta.url)),
);
const quote = (value) => "'" + String(value).replaceAll("'", "''") + "'";
const rows = data.products
  .filter((p) => (p.originalPrice ?? p.price) != null)
  .map(
    (p) =>
      `(${quote(p.id)},${quote(p.name.en)},${quote(p.name.ar)},${p.originalPrice ?? p.price})`,
  );
writeFileSync(
  new URL(
    "../supabase/migrations/20261106080237_inventory_seed.sql",
    import.meta.url,
  ),
  `-- Generated from the existing catalog. Real stock must be entered by an admin.\ninsert into public.inventory(product_id,name_en,name_ar,price) values\n${rows.join(",\n")}\non conflict(product_id) do nothing;\n`,
);
