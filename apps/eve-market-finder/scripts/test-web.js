// Checks the bundled Market Finder page has a complete data block.
'use strict';
const fs = require('fs');
const path = require('path');
require('./copy-web');
const html = fs.readFileSync(path.join(__dirname, '..', 'web', 'index.html'), 'utf8');
const m = html.match(/<script id="data" type="application\/json">([\s\S]*?)<\/script>/);
if (!m) throw new Error('data block missing');
const d = JSON.parse(m[1]);
const n = { systems: Object.keys(d.sys).length, items: d.types.length, groups: Object.keys(d.groups).length };
if (n.systems < 5000 || n.items < 15000 || n.groups < 1500) throw new Error('data looks incomplete: ' + JSON.stringify(n));
console.log('Market Finder page OK:', JSON.stringify(n));
