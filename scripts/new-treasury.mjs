// Generate a Privi treasury keypair and write it to .env.local without
// printing the secret. Prints only the public address.
//   node scripts/new-treasury.mjs [--env .env.local]
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { createKeyPairSignerFromPrivateKeyBytes, getBase58Decoder } from "@solana/kit";

const envFile = process.argv.includes("--env") ? process.argv[process.argv.indexOf("--env") + 1] : ".env.local";
const current = existsSync(envFile) ? readFileSync(envFile, "utf8") : "";
if (/^PRIVI_TREASURY_SECRET=.+$/m.test(current)) {
  console.error(`${envFile} already has PRIVI_TREASURY_SECRET; refusing to overwrite a treasury key.`);
  process.exit(1);
}
const seed = crypto.getRandomValues(new Uint8Array(32));
const signer = await createKeyPairSignerFromPrivateKeyBytes(seed);
const secret = getBase58Decoder().decode(seed);
seed.fill(0);
const line = `PRIVI_TREASURY_SECRET=${secret}`;
const next = /^PRIVI_TREASURY_SECRET=.*$/m.test(current) ? current.replace(/^PRIVI_TREASURY_SECRET=.*$/m, line) : `${current.replace(/\n?$/, "\n")}${line}\n`;
writeFileSync(envFile, next, { mode: 0o600 });
console.log(`Treasury address: ${signer.address}`);
console.log(`Secret written to ${envFile} (not printed). Back it up somewhere safe — losing it loses the ring balance.`);
