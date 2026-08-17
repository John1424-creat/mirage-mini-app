import pg from "pg";
import { loadConfig } from "./config.mjs";
import { createHttpServer } from "./http.mjs";
import { PostgresRepository } from "./postgres-repository.mjs";
import { createRoundService } from "./round-service.mjs";
import { createPyramidEngine } from "./pyramid-engine.mjs";

const config = loadConfig();
const pool = new pg.Pool({
  connectionString: config.databaseUrl,
  ssl: config.nodeEnv === "production" ? { rejectUnauthorized: true } : false,
  max: 10,
});
const repository = new PostgresRepository(pool);
const roundEngine = createPyramidEngine();
const roundService = createRoundService({ repository, engine: roundEngine, mathVersion: config.mathVersion });
const server = createHttpServer({ config, repository, roundService });

server.listen(config.port, () => {
  console.log(`Mirage backend listening on http://127.0.0.1:${config.port}`);
});

async function shutdown(signal) {
  console.log(`${signal}: shutting down`);
  server.close(async () => {
    await pool.end();
    process.exit(0);
  });
}

process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));
