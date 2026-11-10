import { randomBytes, scryptSync } from "node:crypto";
import { stdin, stdout } from "node:process";
import { createInterface } from "node:readline/promises";

const rl = createInterface({ input: stdin, output: stdout });
try {
  const password = await rl.question("Nova senha do administrador: ");
  if (password.length < 14) {
    console.error("Use pelo menos 14 caracteres.");
    process.exitCode = 1;
  } else {
    const salt = randomBytes(16);
    const derived = scryptSync(password, salt, 64, { N: 16384, r: 8, p: 1 });
    console.log("\nADMIN_PASSWORD_HASH=scrypt$" + salt.toString("hex") + "$" + derived.toString("hex"));
  }
} finally {
  rl.close();
}
