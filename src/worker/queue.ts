import PgBoss from "pg-boss";

/**
 * pg-boss rather than a Redis-backed queue: the app already owns a Postgres,
 * and a job that measures a video for three minutes wants durable state in the
 * same transaction boundary as the process row it updates.
 */
export const QUEUE_ABSORB_INSPO = "absorb-inspo";
export const QUEUE_ABSORB_SCRIPT = "absorb-script";
export const QUEUES = [QUEUE_ABSORB_INSPO, QUEUE_ABSORB_SCRIPT] as const;

export interface AbsorbInspoJob {
  processId: number;
  buildId: number;
}

export interface AbsorbScriptJob {
  processId: number;
  buildId: number;
}

declare global {
  // eslint-disable-next-line no-var
  var __boss: PgBoss | undefined;
  // eslint-disable-next-line no-var
  var __bossStarted: Promise<PgBoss> | undefined;
}

function create(): PgBoss {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw new Error("DATABASE_URL is not set");
  return new PgBoss({ connectionString, schema: process.env.PGBOSS_SCHEMA ?? "pgboss" });
}

/**
 * Start (or join) the shared boss instance and ensure every queue exists.
 * v10 requires a queue to be created before send() or work() will accept it.
 */
export async function getBoss(): Promise<PgBoss> {
  if (globalThis.__bossStarted) return globalThis.__bossStarted;

  globalThis.__bossStarted = (async () => {
    const boss = globalThis.__boss ?? create();
    globalThis.__boss = boss;
    boss.on("error", (error) => console.error("[pg-boss]", error));
    await boss.start();
    for (const queue of QUEUES) await boss.createQueue(queue);
    return boss;
  })();

  return globalThis.__bossStarted;
}

export async function enqueue(queue: string, data: object): Promise<string | null> {
  const boss = await getBoss();
  return boss.send(queue, data, {
    // A failed measurement is usually a bad input rather than a flake, so
    // retries are few and spaced: a three-minute ffmpeg run retried tightly
    // just burns the worker.
    retryLimit: 2,
    retryDelay: 30,
    retryBackoff: true,
    expireInMinutes: 60,
  });
}
