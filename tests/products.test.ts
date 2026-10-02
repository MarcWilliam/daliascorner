import { strict as assert } from "node:assert";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import {
  PRODUCTS,
  getProduct,
  getProductFamiliesByCategory,
  getProductFamilyId,
  getProductName,
  getProductVariants,
} from "../lib/products";
import { buildOrderMessage } from "../lib/whatsapp";
import { buildCatalogCsv } from "../lib/catalog";
import { productJsonLd } from "../lib/jsonld";
import { buildLlmsTxt } from "../lib/llms";
import { dictionaries } from "../lib/i18n/dictionaries";
import { productUrl } from "../lib/config";

test("every sellable item has a unique ID, bilingual copy, and real photo assets", () => {
  assert.equal(new Set(PRODUCTS.map((p) => p.id)).size, PRODUCTS.length);
  for (const p of PRODUCTS) {
    for (const field of [p.name, p.blurb, p.alt, p.variantLabel, p.color]) {
      if (field) assert.ok(field.en.trim() && field.ar.trim(), p.id);
    }
    for (const path of [p.image, p.thumb]) {
      assert.ok(existsSync(join(process.cwd(), "public", path)), path);
    }
    assert.ok(p.price == null || (Number.isFinite(p.price) && p.price > 0), p.id);
    if (p.variantOf) {
      const parent = getProduct(p.variantOf);
      assert.ok(parent && !parent.variantOf, `Missing or nested family: ${p.id}`);
      assert.equal(p.category, parent.category);
    }
  }
});

test("variants share one collection card and preserve the original Bahloul ID", () => {
  const original = getProduct("bahloul")!;
  assert.equal(original.image, "/products/bahloul.webp");
  const variants = getProductVariants(original);
  assert.deepEqual(variants.map((p) => p.id), ["bahloul", "bahloul-green"]);
  assert.deepEqual(getProductVariants(variants[1]), variants);
  const cards = getProductFamiliesByCategory("ultra-small");
  assert.ok(cards.some((p) => p.id === "bahloul"));
  assert.ok(!cards.some((p) => p.id === "bahloul-green"));
  assert.ok(!cards.some((p) => p.id === "semsem-yellow"));
  assert.equal(getProductVariants(getProduct("azza")!).length, 1);
});

test("every choice in a family has a distinct bilingual order name", () => {
  for (const product of PRODUCTS) {
    const variants = getProductVariants(product);
    for (const locale of ["en", "ar"] as const) {
      assert.equal(new Set(variants.map((p) => getProductName(p, locale))).size, variants.length);
    }
  }
  const renamed = { ...getProduct("bahloul-green")!, name: { en: "Another name", ar: "اسم تاني" } };
  assert.equal(getProductFamilyId(renamed), "bahloul");
  assert.equal(getProductName(renamed, "en"), "Another name — Green");
});

test("WhatsApp orders keep two colours and quantities separate in both languages", () => {
  const lines = [{ id: "semsem" as const, qty: 2 }, { id: "semsem-yellow" as const, qty: 1 }];
  const en = buildOrderMessage(lines, "en", dictionaries.en);
  assert.ok(en.includes("Semsem — White × 2"));
  assert.ok(en.includes("Semsem — Yellow × 1"));
  assert.ok(en.includes("840 EGP"));
  const ar = buildOrderMessage(lines, "ar", dictionaries.ar);
  assert.ok(ar.includes("سمسم — أبيض × 2"));
  assert.ok(ar.includes("سمسم — أصفر × 1"));
  assert.ok(ar.includes("840 جنيه"));
});

test("the Meta feed retains distinct variant IDs, landing pages, group and colour", () => {
  // RFC 4180 parser so a comma or quote in a description cannot shift assertions.
  const rows: string[][] = [];
  let row: string[] = [], cell = "", quoted = false;
  const csv = buildCatalogCsv();
  for (let i = 0; i < csv.length; i++) {
    const char = csv[i];
    if (char === '"') {
      if (quoted && csv[i + 1] === '"') { cell += '"'; i++; }
      else quoted = !quoted;
    } else if (!quoted && (char === "," || char === "\n")) {
      row.push(cell); cell = "";
      if (char === "\n") { rows.push(row); row = []; }
    } else cell += char;
  }
  const header = rows.shift()!;
  const feed = rows.map((values) => Object.fromEntries(header.map((key, i) => [key, values[i]])));
  assert.equal(feed.length, PRODUCTS.filter((p) => p.price != null).length);
  for (const id of ["semsem", "semsem-yellow"] as const) {
    const item = feed.find((p) => p.id === id)!;
    assert.equal(item.item_group_id, "semsem");
    assert.equal(item.link, productUrl(id));
    assert.equal(item.title, getProductName(getProduct(id)!, "en"));
    assert.equal(item.color, id === "semsem" ? "White" : "Yellow");
    assert.equal(item.sale_price, "");
  }
  assert.equal(feed.find((p) => p.id === "azza")!.price, "450.00 EGP");
  assert.equal(feed.find((p) => p.id === "azza")!.item_group_id, "");
});

test("structured data and the text catalog identify the exact colour and price", () => {
  const p = getProduct("bahloul-green")!;
  const [schema] = productJsonLd(p) as Record<string, any>[];
  assert.equal(schema.sku, p.id);
  assert.equal(schema.name, "Bahloul — Green");
  assert.equal(schema.inProductGroupWithID, "bahloul");
  assert.equal(schema.offers.price, "320");
  assert.equal(schema.offers.url, productUrl(p.id));
  const text = buildLlmsTxt();
  assert.ok(text.includes(`[Bahloul — Green](${productUrl(p.id)})`));
  assert.ok(text.includes("Semsem — White"));
  assert.ok(text.includes("Semsem — Yellow"));
});
