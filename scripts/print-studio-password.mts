import { hashStudioPassword } from "../src/lib/print-studio/auth-core";

// Read only from stdin: the password never appears in command arguments, logs, or source files.
let password = "";
for await (const chunk of process.stdin) {
  password += chunk.toString();
  if (Buffer.byteLength(password) > 1026) throw new Error("Senha muito longa.");
}
console.log(await hashStudioPassword(password.replace(/\r?\n$/, "")));
