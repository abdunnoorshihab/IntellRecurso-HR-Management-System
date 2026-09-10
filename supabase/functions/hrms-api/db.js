import postgres from 'https://deno.land/x/postgresjs@v3.4.5/mod.js';

let sqlClient = null;

function getSql() {
  const connectionString = Deno.env.get('SUPABASE_DB_URL');
  if (!connectionString) throw new Error('SUPABASE_DB_URL is not configured');
  if (!sqlClient) {
    sqlClient = postgres(connectionString, {
      prepare: false,
      max: 1,
      idle_timeout: 20,
      connect_timeout: 10
    });
  }
  return sqlClient;
}

function pgQuery(text) {
  let index = 0;
  return String(text).replace(/\?/g, () => `$${++index}`);
}

async function all(text, ...params) {
  const sql = getSql();
  return sql.unsafe(pgQuery(text), params);
}

async function get(text, ...params) {
  const rows = await all(text, ...params);
  return rows[0] || null;
}

async function run(text, ...params) {
  const rows = await all(text, ...params);
  return { rows, count: Number(rows.count ?? rows.length ?? 0) };
}

async function close() {
  if (sqlClient) {
    await sqlClient.end({ timeout: 2 });
    sqlClient = null;
  }
}

export default { all, get, run, close };
