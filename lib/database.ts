// The existing D1 database is accessed through Cloudflare's HTTPS API on Vercel.
// Credentials are server-only environment variables; no token reaches the browser.
type Query = { sql: string; params: unknown[] };
type Result<T> = { success: boolean; results: T[]; error?: string };

const account = process.env.CLOUDFLARE_ACCOUNT_ID;
const id = process.env.CLOUDFLARE_D1_DATABASE_ID;
const token = process.env.CLOUDFLARE_D1_API_TOKEN;

async function execute<T>(queries: Query[]): Promise<Result<T>[]> {
  const response = await fetch(
    `https://api.cloudflare.com/client/v4/accounts/${account}/d1/database/${id}/query`,
    {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify(queries.length === 1 ? queries[0] : { batch: queries }),
      cache: "no-store",
      signal: AbortSignal.timeout(10000),
    },
  );
  const body = await response.json() as { success: boolean; result: Result<T>[] };
  if (!response.ok || !body.success || !body.result?.every(r => r.success)) {
    throw new Error(`D1 query failed (${response.status})`);
  }
  return body.result;
}

class Statement {
  constructor(readonly sql: string, readonly params: unknown[] = []) {}
  bind(...params: unknown[]) { return new Statement(this.sql, params); }
  async first<T>(): Promise<T | null> {
    return (await execute<T>([this]))[0].results[0] ?? null;
  }
  async all<T>(): Promise<{ results: T[] }> {
    return { results: (await execute<T>([this]))[0].results };
  }
}

export const database = account && id && token ? {
  prepare: (sql: string) => new Statement(sql),
  batch: (statements: Statement[]) => execute(statements),
} : null;
