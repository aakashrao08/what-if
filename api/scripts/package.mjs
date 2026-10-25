// Assembles api/deploy: exactly what Azure Static Web Apps needs for a prebuilt managed API
// (host.json, a package.json pointing at the bundle, and the bundle itself; no node_modules).
import { cpSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';

rmSync('deploy', { recursive: true, force: true });
mkdirSync('deploy/dist', { recursive: true });
cpSync('host.json', 'deploy/host.json');
cpSync('dist/index.js', 'deploy/dist/index.js');
const pkg = JSON.parse(readFileSync('package.json', 'utf8'));
writeFileSync('deploy/package.json', JSON.stringify({ name: pkg.name, version: pkg.version, private: true, main: 'dist/index.js', type: 'commonjs' }, null, 2));
console.log('api/deploy ready');
