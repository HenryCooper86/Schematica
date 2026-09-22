#!/usr/bin/env node
// The same validator and design rules as the editor, usable in review/CI.
import { readFile, stat } from 'node:fs/promises';
import { deserialize } from '../src/serialize.js';
import { validationCoverage, reviewReadiness, coverageSummary, coverageScope } from '../src/validation-coverage.js';
import { checkDoc } from '../src/drc.js';

const args = process.argv.slice(2);
const json = args.includes('--json');
const strict = args.includes('--strict');
const requireReady = args.includes('--review-ready');
const files = args.filter(arg => !['--json', '--strict', '--review-ready'].includes(arg));
if (!files.length || files.some(file => file.startsWith('--'))) {
  console.error('Usage: npm run check:board -- [--json] [--strict] [--review-ready] board.schematica.json [...]');
  process.exitCode = 2;
} else {
  const reports = [];
  for (const file of files) {
    try {
      if ((await stat(file)).size > 16 * 1024 * 1024) throw new Error('Board file exceeds 16 MiB.');
      const { doc, warnings } = deserialize(await readFile(file, 'utf8'));
      const findings = checkDoc(doc);
      const coverage = validationCoverage(doc);
      const readiness = reviewReadiness(doc, findings, coverage);
      const failed = (requireReady && !readiness.ready) || warnings.length > 0 || findings.some(f => f.level === 'error' || (strict && f.level === 'warning'));
      reports.push({ file, title: doc.title, warnings, findings, coverage, reviewReady: warnings.length === 0 && readiness.ready, passed: !failed });
      if (failed) process.exitCode = Math.max(process.exitCode || 0, 1);
    } catch (error) {
      reports.push({ file, error: error.message, passed: false });
      process.exitCode = 2;
    }
  }
  if (json) console.log(JSON.stringify({ version: 1, reports }, null, 2));
  else for (const report of reports) {
    console.log(`${report.passed ? 'PASS' : 'FAIL'} ${report.file}`);
    if (report.coverage) {
      console.log(`  ${coverageSummary(report.coverage)}`);
      console.log(`  ${coverageScope()}`);
      for (const connection of report.coverage.connections.filter(c => c.missing.length)) {
        console.log(`  ${connection.label}: missing ${connection.missing.join(', ')}`);
      }
      console.log(`  Interface review ready: ${report.reviewReady ? 'yes' : 'no'}`);
    }
    if (report.error) console.log(`  ${report.error}`);
    for (const warning of report.warnings || []) console.log(`  import: ${warning}`);
    for (const finding of report.findings || []) console.log(`  ${finding.level} [${finding.rule}] ${finding.message}`);
  }
}
