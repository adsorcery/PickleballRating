import { closeDatabase } from "../src/lib/db/client";
import { initialize } from "../src/lib/init";

initialize()
  .then(() => console.log("Database is up to date."))
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => closeDatabase());
