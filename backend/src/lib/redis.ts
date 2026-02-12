import { createClient } from 'redis';

const client = createClient({
  url: process.env.REDIS_URL || 'redis://localhost:6379'
});

client.on('error', (err) => console.error('Redis Client Error', err));
client.on('connect', () => console.log('Redis connected'));

await client.connect();

export default client;

// Helper functions
export async function setWithExpiry(key: string, value: string, expirySeconds: number) {
  await client.setEx(key, expirySeconds, value);
}

export async function getAndDelete(key: string) {
  const value = await client.get(key);
  if (value) await client.del(key);
  return value;
}
