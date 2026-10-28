import readline from "node:readline";
import { createUser, normalizeEmail } from "../src/lib/auth/auth";
import { hashPassword, MIN_PASSWORD_LENGTH } from "../src/lib/auth/password";
import { closeDatabase, getDatabase } from "../src/lib/db/client";
import { initialize } from "../src/lib/init";
import { users } from "../src/lib/db/schema";
import { eq } from "drizzle-orm";

function promptHidden(question: string): Promise<string> {
  return new Promise((resolve) => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout, terminal: true });
    const write = (rl as unknown as { _writeToOutput: (s: string) => void })._writeToOutput;
    (rl as unknown as { _writeToOutput: (s: string) => void })._writeToOutput = function (s: string) {
      if (s.includes(question)) write.call(rl, s);
    };
    rl.question(question, (answer) => {
      rl.close();
      process.stdout.write("\n");
      resolve(answer);
    });
  });
}

async function main() {
  const email = process.argv[2] ?? process.env.ADMIN_EMAIL;
  if (!email) throw new Error("Usage: npm run admin:create -- <email>   (password via ADMIN_PASSWORD or prompt)");
  const password = process.env.ADMIN_PASSWORD ?? (await promptHidden("Password (min 12 chars): "));
  if (password.length < MIN_PASSWORD_LENGTH) throw new Error(`Password must be at least ${MIN_PASSWORD_LENGTH} characters.`);

  const opened = getDatabase();
  await initialize(opened);
  const normalized = normalizeEmail(email);
  const passwordHash = await hashPassword(password);
  const existing = opened.db.select().from(users).where(eq(users.email, normalized)).get();
  if (existing) {
    opened.db.update(users).set({ passwordHash }).where(eq(users.id, existing.id)).run();
    console.log(`Updated password for ${normalized}`);
  } else {
    createUser(opened.db, { email: normalized, passwordHash });
    console.log(`Created admin ${normalized}`);
  }
}

main()
  .catch((err) => {
    console.error(err.message ?? err);
    process.exitCode = 1;
  })
  .finally(() => closeDatabase());
