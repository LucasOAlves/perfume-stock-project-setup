import "reflect-metadata";
import { env } from "./config/env";
import { AppDataSource } from "./config/data-source";
import { buildApp } from "./app";

async function main(): Promise<void> {
  await AppDataSource.initialize();
  const app = await buildApp(AppDataSource);
  await app.listen({ port: env.port, host: "0.0.0.0" });
}

main().catch((error) => {
  // eslint-disable-next-line no-console
  console.error("Failed to start server", error);
  process.exit(1);
});
