import pg from 'pg';

const { Pool } = pg;

// Parse DATABASE_URL and ensure password is explicitly a string
const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  throw new Error('DATABASE_URL environment variable is not set');
}

// Parse URL to extract components
const url = new URL(databaseUrl);
const config = {
  host: url.hostname,
  port: parseInt(url.port || '5432'),
  database: url.pathname.slice(1), // Remove leading slash
  user: url.username,
  password: url.password || '', // Ensure password is a string
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 2000,
};

console.log('Connecting to PostgreSQL:', {
  host: config.host,
  port: config.port,
  database: config.database,
  user: config.user,
  passwordSet: !!config.password,
});

export const pool = new Pool(config);

// Utility functions
export async function query(text: string, params?: any[]) {
  const start = Date.now();
  const res = await pool.query(text, params);
  const duration = Date.now() - start;
  console.log('Query executed', { text, duration, rows: res.rowCount });
  return res;
}

export async function getClient() {
  const client = await pool.connect();
  const release = client.release.bind(client);

  // Wrap release to log timing
  client.release = () => {
    client.removeListener('error', () => {});
    release();
  };

  return client;
}
