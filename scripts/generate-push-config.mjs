// Generates secrets into an ignored, owner-readable file; never prints values.
import { createECDH, randomBytes } from "node:crypto";
import { writeFileSync, readFileSync, existsSync } from "node:fs";
const path = ".env.push.local";
if (existsSync(path))
  throw new Error(
    "Push configuration already exists; refusing to rotate keys accidentally.",
  );
const ecdh = createECDH("prime256v1");
ecdh.generateKeys();
const publicKey = ecdh.getPublicKey().toString("base64url");
writeFileSync(
  path,
  `VAPID_PUBLIC_KEY=${publicKey}\nVAPID_PRIVATE_KEY=${ecdh.getPrivateKey().toString("base64url")}\nVAPID_SUBJECT=https://daliascorner.com\nNOTIFY_SECRET=${randomBytes(32).toString("hex")}\n`,
  { mode: 0o600, flag: "wx" },
);
const envPath = ".env.local";
const existing = existsSync(envPath) ? readFileSync(envPath, "utf8") : "";
writeFileSync(
  envPath,
  existing.replace(/^NEXT_PUBLIC_VAPID_PUBLIC_KEY=.*\n?/m, "") +
    `\nNEXT_PUBLIC_VAPID_PUBLIC_KEY=${publicKey}\n`,
  { mode: 0o600 },
);
console.log(
  "Generated .env.push.local (private) and added the public push key to .env.local. No secret values printed.",
);
