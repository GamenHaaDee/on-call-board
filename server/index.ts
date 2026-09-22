// Standalone server: API + (indien aanwezig) de gebouwde frontend.
import { config } from "./config";
import { createApp, startScheduler } from "./app";
import { getDbConfig } from "./settings";
import { closePool } from "./rotation";

async function start() {
  const app = createApp();
  await startScheduler();

  app.listen(config.port, () => {
    console.log(
      `[server] Luistert op http://localhost:${config.port} ` +
        `(database: ${getDbConfig().driver}, cron: "${config.cronSchedule}")`
    );
  });
}

start().catch((err) => {
  console.error("[server] Starten mislukt:", err);
  process.exit(1);
});

for (const sig of ["SIGINT", "SIGTERM"] as const) {
  process.on(sig, async () => {
    await closePool().catch(() => {});
    process.exit(0);
  });
}
