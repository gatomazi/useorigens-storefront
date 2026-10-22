import { hashAdminPassword } from "../src/lib/admin/auth/password";

// The owner's fallback password for ADMIN_OWNER_PASSWORD_HASH. Read only from stdin: the password never appears in arguments, logs or files.
//   printf '%s' "$senha" | npm run -s admin:password-hash
let password = "";
for await (const chunk of process.stdin) {
  password += chunk.toString();
  if (Buffer.byteLength(password) > 1026) throw new Error("Senha muito longa.");
}
console.log(await hashAdminPassword(password.replace(/\r?\n$/, "")));
