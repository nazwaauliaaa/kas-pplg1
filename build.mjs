import { cpSync, mkdirSync, rmSync } from 'node:fs';

const STATIC_FILES = [
  'index.html',
  'styles.css',
  'app.js',
  'kas-logic.js',
  'cloud-sync.js',
  'firebase-config.js',
  'firebase-sync.js',
  'manifest.webmanifest',
  'sw.js',
];

rmSync('dist', { recursive: true, force: true });
mkdirSync('dist', { recursive: true });

for (const file of STATIC_FILES) {
  cpSync(file, `dist/${file}`);
}

cpSync('icons', 'dist/icons', { recursive: true });
console.log('Built static assets into dist/');
