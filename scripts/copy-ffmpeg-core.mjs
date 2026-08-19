import { cpSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const src = join(root, 'node_modules/@ffmpeg/core/dist/esm');
const dest = join(root, 'public/ffmpeg');

mkdirSync(dest, { recursive: true });
cpSync(join(src, 'ffmpeg-core.js'), join(dest, 'ffmpeg-core.js'));
cpSync(join(src, 'ffmpeg-core.wasm'), join(dest, 'ffmpeg-core.wasm'));
console.log('Copied ffmpeg core to public/ffmpeg');
