#!/usr/bin/env node
/**
 * electron-packager を node.exe から直接叩くためのラッパー。
 * bun で呼ぶと source-map-support の相性問題があるため、このファイルは
 * 必ず node 経由で実行する前提。
 *
 * 使い方:  node tools/package-app.mjs
 * scripts: "package": "bun run build && node tools/package-app.mjs"
 */
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, '..');

const packagerCli = path.join(
  projectRoot,
  'node_modules',
  '@electron',
  'packager',
  'bin',
  'electron-packager.js',
);

const ignorePattern = [
  '^/src$',
  '^/scripts$',
  '^/input$',
  '^/config$',
  '^/tools$',
  '^/\\.vscode$',
  '^/\\.git',
  '^/release$',
  '^/README',
  '\\.ts$',
  'tsconfig.*\\.json$',
  'vite\\.config\\.ts$',
  'tailwind\\.config\\.js$',
  'postcss\\.config\\.js$',
  'bun\\.lock$',
].join('|');

const args = [
  packagerCli,
  '.',
  'keikaku-qc',
  '--platform=win32',
  '--arch=x64',
  '--out=release',
  '--overwrite',
  '--prune=true',
  `--ignore=${ignorePattern}`,
];

console.log('→ electron-packager 開始\n  cwd:', projectRoot);
const result = spawnSync(process.execPath, args, {
  cwd: projectRoot,
  stdio: 'inherit',
});

if (result.status !== 0) {
  console.error('\n✗ electron-packager failed with exit code', result.status);
  process.exit(result.status ?? 1);
}

console.log('\n✓ Packaged: release/keikaku-qc-win32-x64/');
console.log('  → 次に config/ フォルダをコピーしてください:');
console.log('    cp -r config release/keikaku-qc-win32-x64/config');
