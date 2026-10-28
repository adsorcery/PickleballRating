import { closeDatabase, getDatabase } from "../src/lib/db/client";
import { runBackupNow } from "../src/lib/backup";
import { initialize } from "../src/lib/init";

async function main() {
  await initialize(getDatabase());
  const result = await runBackupNow("cli");
  console.log(result);
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => closeDatabase());
