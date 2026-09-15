#!/usr/bin/env node
// The same validator and design rules as the editor, usable in review/CI.
import { readFile, stat } from 'node:fs/promises';
import { deserialize } from '../src/serialize.js';
import { checkDoc } from '../src/drc.js';

const args = process.argv.slice(2);
const json = args.includes('--json');
const strict = args.includes('--strict');
const files = args.filter(arg => !['--json', '--strict'].includes(arg));
if (!files.length || files.some(file => file.startsWith('--'))) {
  console.error('Usage: npm run check:board -- [--json] [--strict] board.schematica.json [...]');
  process.exitCode = 2;
} else {
  const reports = [];
  for (const file of files) {
    try {
      if ((await stat(file)).size > 16 * 1024 * 1024) throw new Error('Board file exceeds 16 MiB.');
      const { doc, warnings } = deserialize(await readFile(file, 'utf8'));
      const findings = checkDoc(doc);
      const failed = warnings.length > 0 || findings.some(f => f.level === 'error' || (strict && f.level === 'warning'));
      reports.push({ file, title: doc.title, warnings, findings, passed: !failed });
      if (failed) process.exitCode = Math.max(process.exitCode || 0, 1);
    } catch (error) {
      reports.push({ file, error: error.message, passed: false });
      process.exitCode = 2;
    }
  }
  if (json) console.log(JSON.stringify({ version: 1, reports }, null, 2));
  else for (const report of reports) {
    console.log(`${report.passed ? 'PASS' : 'FAIL'} ${report.file}`);
    if (report.error) console.log(`  ${report.error}`);
    for (const warning of report.warnings || []) console.log(`  import: ${warning}`);
    for (const finding of report.findings || []) console.log(`  ${finding.level} [${finding.rule}] ${finding.message}`);
  }
}
