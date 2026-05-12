#!/usr/bin/env node
/**
 * dist-electron/package.json に {"type": "commonjs"} を書き出す。
 * 親 package.json が "type": "module" でも、tsc が出す CJS 形式の
 * main.js を Node (Electron) に正しく解釈させるため。
 */
import { writeFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, '..');
const outDir = path.join(projectRoot, 'dist-electron');

mkdirSync(outDir, { recursive: true });
writeFileSync(
  path.join(outDir, 'package.json'),
  JSON.stringify({ type: 'commonjs' }, null, 2) + '\n',
  'utf8',
);

console.log('✓ dist-electron/package.json (type: commonjs) 生成');
