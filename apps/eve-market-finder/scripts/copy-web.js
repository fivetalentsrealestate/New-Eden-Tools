// Copies the Market Finder web page (apps/market-finder) into this app as its offline copy.
'use strict';
const fs = require('fs');
const path = require('path');
const from = path.join(__dirname, '..', '..', 'market-finder');
const to = path.join(__dirname, '..', 'web');
fs.rmSync(to, { recursive: true, force: true });
fs.mkdirSync(to, { recursive: true });
for (const f of ['index.html', 'icon-192.png', 'icon-512.png', 'apple-touch-icon.png', 'manifest.webmanifest']) {
  if (fs.existsSync(path.join(from, f))) fs.copyFileSync(path.join(from, f), path.join(to, f));
}
console.log('Copied Market Finder page into web/');
