// Incident replay: a board rebuilt from a log replays on a clock; reached
// parts light up and the dock counts actions, phases and days.
import { parseIncidentLog, reconstructIncident } from '../../src/incident-replay.js';

export const REPLAY_LOG = {
  incident: 'IR-E2E',
  blastRadius: 'one test robot',
  trustBoundaries: [{ id: 'cloud', name: 'Cloud' }],
  nodes: { attacker: 'threatactor', api: 'server', robot: 'aisbc', store: 'database' },
  actions: [
    { ts: '2026-03-11T08:00:00Z', actor: 'attacker', action: 'recon', target: 'api', phase: 'recon', command: 'nmap -sV api', evidence: '443/tcp open', boundary: 'cloud' },
    { ts: '2026-03-11T09:00:00Z', actor: 'attacker', action: 'rce', target: 'api', phase: 'rce', command: 'id', evidence: 'uid=0(root)' },
    { ts: '2026-03-11T12:00:00Z', actor: 'api', action: 'pushes', target: 'robot', phase: 'impact' },
    { ts: '2026-03-12T02:00:00Z', actor: 'attacker', action: 'exfil', target: 'store', phase: 'exfil' },
  ],
};

export async function runReplayChecks({ js, key, check, sleep, loadBoard }) {
  await loadBoard(reconstructIncident(parseIncidentLog(JSON.stringify(REPLAY_LOG))).doc);
  check('a board rebuilt from a log offers Replay incident', await js(`!document.getElementById('replay-chip').hidden`));
  await js(`document.getElementById('replay-chip').click(); true`);
  await sleep(300);
  const start = await js(`(() => ({ dock: !document.getElementById('replay-dock').hidden, presenting: document.getElementById('app').classList.contains('replaying'),
    muted: document.querySelectorAll('#canvas .node.story-muted').length, nodes: document.querySelectorAll('#canvas .node').length,
    actions: document.querySelector('[data-r=actions]').textContent, days: document.querySelectorAll('.replay-day').length }))()`);
  check('replay opens the dock with every part dim and nothing replayed yet', start.dock && start.presenting && start.muted === start.nodes && start.actions === '0' && start.days === 2, JSON.stringify(start));
  await key('ArrowRight', 'ArrowRight', 39);
  await key('ArrowRight', 'ArrowRight', 39);
  await sleep(150);
  const two = await js(`(() => ({ actions: document.querySelector('[data-r=actions]').textContent, phase: document.querySelector('[data-r=phase]').textContent,
    lit: document.querySelectorAll('#canvas .node.story-match').length, stream: [...document.querySelectorAll('[data-r=stream] code')].map(c => c.textContent),
    evidence: document.querySelector('[data-r=stream] li p')?.textContent || '' }))()`);
  check('stepping through events lights reached parts and streams commands with evidence, newest first', two.actions === '2' && two.phase === 'rce' && two.lit === 2 && two.stream[0] === 'id' && two.stream[1] === 'nmap -sV api' && /uid=0/.test(two.evidence), JSON.stringify(two));
  await js(`document.querySelector('[data-speed="4"]').click(); document.querySelector('[data-r=play]').click(); true`);
  let end = null;
  for (let i = 0; i < 80; i++) {
    end = await js(`({ actions: document.querySelector('[data-r=actions]').textContent, muted: document.querySelectorAll('#canvas .node.story-muted').length, reach: document.querySelector('[data-r=reach]').textContent })`);
    if (end.actions === '4') break;
    await sleep(250);
  }
  check('playing at 4× reaches the end of the incident with every part lit', end.actions === '4' && end.muted === 0 && /4 of 4/.test(end.reach), JSON.stringify(end));
  await key('Escape', 'Escape', 27);
  await sleep(150);
  const out = await js(`({ dock: document.getElementById('replay-dock').hidden, mode: document.getElementById('app').classList.contains('replaying'), muted: document.querySelectorAll('#canvas .node.story-muted').length, chip: !document.getElementById('replay-chip').hidden })`);
  check('Escape leaves the replay and restores the board', out.dock && !out.mode && out.muted === 0 && out.chip, JSON.stringify(out));
}
