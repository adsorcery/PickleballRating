/** Verifies a backup file (.sqlite or .sqlite.gz) without touching the live database. */
import { verifyBackup } from "../src/lib/backup";

const file = process.argv[2];
if (!file) {
  console.error("Usage: npm run db:restore-check -- <backup-file>");
  process.exit(2);
}

verifyBackup(file)
  .then((report) => {
    console.log(report);
    const good = report.integrity === "ok" && report.foreignKeyViolations === 0 && report.ratingsConsistent;
    console.log(good ? "BACKUP OK: integrity, foreign keys and rating replay all verified." : "BACKUP PROBLEM: see report above.");
    process.exit(good ? 0 : 1);
  })
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
