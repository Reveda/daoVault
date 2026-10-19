/**
 * Creates the payout signer key (owner, 2026-10-13). Run ONCE on the VPS:
 *
 *   docker run --rm -v "$PWD/secrets/signer:/out" daovault-backend:prod node dist/signer/keygen.js /out
 *   (or on a PC: npx tsx src/signer/keygen.ts ../secrets/signer). Only that folder is mounted into the
 *   signer container (docker-compose.prod.yml), never the rest of ./secrets.
 *
 * Writes into the folder:
 *   payout_keystore.json           the key, encrypted (scrypt) with the password below
 *   payout_keystore_password.txt   a random 64-character password
 * and prints ONLY the signer address: put it in the DAOvaultPayout constructor (signer_) or
 * setSigner(). The key itself is never printed. It holds no money and needs no BNB.
 * Refuses to overwrite an existing keystore (the contract trusts that one address).
 *
 */
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { randomBytes } from "node:crypto";
import { Wallet } from "ethers";

const dir = resolve(process.argv[2] ?? "secrets");
const keystoreFile = join(dir, "payout_keystore.json");
const passwordFile = join(dir, "payout_keystore_password.txt");
if (existsSync(keystoreFile)) {
  console.error(`${keystoreFile} already exists. Not overwriting it (the payout contract trusts that key).`);
  process.exit(1);
}
mkdirSync(dir, { recursive: true });

const password = randomBytes(32).toString("hex");
const wallet = Wallet.createRandom();
console.log("Encrypting the key (takes a few seconds)...");
const keystore = await wallet.encrypt(password);
writeFileSync(passwordFile, password, { mode: 0o600 });
writeFileSync(keystoreFile, keystore, { mode: 0o600 });

console.log(`\nSigner address: ${wallet.address}`);
console.log(`Saved: ${keystoreFile}`);
console.log(`       ${passwordFile}`);
console.log(
  "\nNext: deploy / setSigner DAOvaultPayout with this address. Back up BOTH files offline (USB),",
);
console.log(
  "never in git, chat or email. Lost files = deploy a new key with setSigner(), no money is lost.",
);
