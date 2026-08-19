import fs from 'fs';
import path from 'path';
import { createHash } from 'crypto';

const API_BASE = 'https://api.netlify.com/api/v1';
const USER_AGENT = 'grid-pattern-generator-drop/1.0';
const DIST = path.resolve('dist');

const headers = (extra = {}) => ({
  'User-Agent': USER_AGENT,
  Referer: 'https://app.netlify.com',
  ...extra,
});

function walk(dir, base = '') {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const rel = base ? `${base}/${entry.name}` : entry.name;
    const abs = path.join(dir, entry.name);
    if (entry.isDirectory()) files.push(...walk(abs, rel));
    else files.push({ rel: `/${rel}`, abs });
  }
  return files;
}

function sha1(filePath) {
  const hash = createHash('sha1');
  hash.update(fs.readFileSync(filePath));
  return hash.digest('hex');
}

async function main() {
  const tokenRes = await fetch(`${API_BASE}/drop/token`, {
    method: 'POST',
    headers: headers({ 'Content-Type': 'application/json' }),
  });
  if (!tokenRes.ok) {
    throw new Error(`drop/token failed: ${tokenRes.status} ${await tokenRes.text()}`);
  }
  const { token } = await tokenRes.json();

  const localFiles = walk(DIST);
  const manifest = Object.fromEntries(
    localFiles.map(({ rel, abs }) => [rel, sha1(abs)])
  );

  const deployRes = await fetch(`${API_BASE}/drop`, {
    method: 'POST',
    headers: headers({ 'Content-Type': 'application/json' }),
    body: JSON.stringify({ files: manifest, token, created_via: 'cli' }),
  });
  if (!deployRes.ok) {
    throw new Error(`drop create failed: ${deployRes.status} ${await deployRes.text()}`);
  }
  const deploy = await deployRes.json();
  const deployId = deploy.id;
  const siteId = deploy.site_id || deploy.site;

  for (const { rel, abs } of localFiles) {
    const body = fs.readFileSync(abs);
    const uploadRes = await fetch(
      `${API_BASE}/deploys/${deployId}/files${encodeURI(rel)}`,
      {
        method: 'PUT',
        headers: headers({
          'Content-Type': 'application/octet-stream',
          Authorization: `Bearer ${token}`,
        }),
        body,
      }
    );
    if (!uploadRes.ok) {
      throw new Error(`upload ${rel} failed: ${uploadRes.status} ${await uploadRes.text()}`);
    }
    process.stdout.write(`uploaded ${rel}\n`);
  }

  let ready;
  for (let i = 0; i < 60; i++) {
    const statusRes = await fetch(`${API_BASE}/sites/${siteId}/deploys/${deployId}`, {
      headers: headers(),
    });
    const data = await statusRes.json();
    if (data.state === 'ready') {
      ready = data;
      break;
    }
    if (data.state === 'error') {
      throw new Error(data.error_message || 'deploy error');
    }
    await new Promise((r) => setTimeout(r, 2000));
  }
  if (!ready) throw new Error('deploy timeout');

  const url = ready.ssl_url || ready.deploy_ssl_url || ready.url;
  console.log(`\nLIVE_URL=${url}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
