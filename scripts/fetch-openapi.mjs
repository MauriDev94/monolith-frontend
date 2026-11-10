// Downloads the production OpenAPI schema into the committed snapshot.
// Override the source with OPENAPI_URL (for example a local backend).
// Render's free plan sleeps, so the first request can take about 50 s.
import { mkdir, writeFile } from 'node:fs/promises';

const url = process.env.OPENAPI_URL ?? 'https://api-monolith.onrender.com/openapi.json';
const target = new URL('../openapi/openapi.json', import.meta.url);

function fail(message) {
  console.error(message);
  process.exit(1);
}

let res;
try {
  res = await fetch(url, { signal: AbortSignal.timeout(120_000) });
} catch (err) {
  // A timeout or network error; Render may still be waking up.
  fail(`Could not reach ${url} (${err.name}: ${err.message}). Retry once the API is awake.`);
}
if (!res.ok) {
  fail(`Could not fetch ${url}: HTTP ${res.status} ${res.statusText}`);
}

let schema;
try {
  schema = await res.json();
} catch {
  // A 200 with HTML instead of JSON (for example a platform "waking up" page).
  fail(`${url} did not return JSON (content-type: ${res.headers.get('content-type')}).`);
}

await mkdir(new URL('./', target), { recursive: true });
// Parse and re-serialize so the snapshot is pretty-printed; key order is kept as served.
await writeFile(target, `${JSON.stringify(schema, null, 2)}\n`);
console.log(`Saved ${url} to openapi/openapi.json`);
