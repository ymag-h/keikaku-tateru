#!/usr/bin/env node
/**
 * config/ ディレクトリを release/keikaku-qc-win32-x64/ 直下にコピー。
 * package-app.mjs の後に実行する想定。
 */
import { cpSync, existsSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, '..');

const src = path.join(projectRoot, 'config');
const dst = path.join(projectRoot, 'release', 'keikaku-qc-win32-x64', 'config');

if (!existsSync(src)) {
  console.error('✗ config/ が見つかりません:', src);
  process.exit(1);
}

mkdirSync(path.dirname(dst), { recursive: true });
cpSync(src, dst, { recursive: true });
console.log('✓ config/ を配置:', dst);
