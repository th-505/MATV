import fs from 'fs';
import path from 'path';
import { spawnSync } from 'child_process';

const nodeExe = process.execPath;
let errorCount = 0;

function checkDirectory(dir) {
  const entries = fs.readdirSync(dir);
  for (const entry of entries) {
    const fullPath = path.join(dir, entry);
    const stat = fs.statSync(fullPath);
    if (stat.isDirectory()) {
      checkDirectory(fullPath);
    } else if (entry.endsWith('.mjs') || (entry.endsWith('.js') && !entry.includes('node_modules'))) {
      const res = spawnSync(nodeExe, ['--check', fullPath], { encoding: 'utf8' });
      if (res.status !== 0) {
        console.error(`FAIL: ${fullPath}\n${res.stderr}`);
        errorCount++;
      } else {
        console.log(`PASS: ${fullPath}`);
      }
    }
  }
}

console.log('Checking server/scrapers syntax:');
checkDirectory('server/scrapers');

if (errorCount > 0) {
  console.error(`Total syntax errors: ${errorCount}`);
  process.exit(1);
} else {
  console.log('All scrapers passed syntax check!');
}
