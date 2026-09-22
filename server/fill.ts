// Eenmalig de planning vooruit vullen in de bestaande piket-tabel.
// Draai met:  npm run server:fill
import { ensureAssignments, closePool } from "./rotation";

ensureAssignments()
  .then(() => console.log("[fill] Klaar."))
  .catch((err) => {
    console.error("[fill] Mislukt:", err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await closePool().catch(() => {});
    process.exit();
  });
