import { loadConfig } from "./config.js";
import { buildServer } from "./server.js";
async function start(): Promise<void> {
  const config = loadConfig(),
    { app } = await buildServer(config);
  for (const signal of ["SIGTERM", "SIGINT"] as const)
    process.once(signal, () => {
      void app
        .close()
        .then(() => process.exit(0))
        .catch(() => process.exit(1));
    });
  await app.listen({ host: config.host, port: config.port });
}
void start().catch(() => {
  process.stderr.write(
    "TartGram could not start. Check required environment settings, data permissions and encryption key.\n",
  );
  process.exitCode = 1;
});
