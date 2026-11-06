import { test } from "node:test";
import assert from "node:assert/strict";
import { setTrackingEnabled } from "../lib/meta";
test("private pages preserve attribution cookies; explicit withdrawal clears them", () => {
  const writes: string[] = [];
  const documentDescriptor = Object.getOwnPropertyDescriptor(
    globalThis,
    "document",
  );
  const locationDescriptor = Object.getOwnPropertyDescriptor(
    globalThis,
    "location",
  );
  Object.defineProperty(globalThis, "document", {
    configurable: true,
    value: {
      set cookie(v: string) {
        writes.push(v);
      },
    },
  });
  Object.defineProperty(globalThis, "location", {
    configurable: true,
    value: { hostname: "shop.example" },
  });
  try {
    setTrackingEnabled(false, false);
    assert.equal(writes.length, 0);
    setTrackingEnabled(false);
    assert.equal(writes.length, 4);
    assert.ok(writes.every((v) => v.includes("Max-Age=0")));
  } finally {
    if (documentDescriptor)
      Object.defineProperty(globalThis, "document", documentDescriptor);
    else Reflect.deleteProperty(globalThis, "document");
    if (locationDescriptor)
      Object.defineProperty(globalThis, "location", locationDescriptor);
    else Reflect.deleteProperty(globalThis, "location");
  }
});
