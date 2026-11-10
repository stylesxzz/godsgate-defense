import bcrypt from "bcryptjs";
import { stdin, stdout } from "node:process";
import { createInterface } from "node:readline/promises";

const rl = createInterface({ input: stdin, output: stdout });
try {
  const password = await rl.question("Nova senha do administrador: ");
  if (password.length < 14) {
    console.error("Use pelo menos 14 caracteres.");
    process.exitCode = 1;
  } else {
    console.log("\nADMIN_PASSWORD_HASH=" + await bcrypt.hash(password, 12));
  }
} finally {
  rl.close();
}