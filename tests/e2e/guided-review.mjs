// Focused browser coverage; registered by the main smoke runner.
export async function runGuidedReviewChecks({ js, key, check, sleep }) {
  await js(`for (const d of document.querySelectorAll('dialog[open]')) d.close(); if(document.getElementById('first-project').hidden) document.getElementById('btn-guide').click(); document.getElementById('guide-uart').focus(); true`);
  await key(' ', 'Space', 32);
  await sleep(300);
  check('UART walkthrough loads through keyboard activation and reports readiness', await js(`document.querySelectorAll('#canvas .node').length === 5 && document.getElementById('first-project').textContent.includes('Ready for interface review') && !document.getElementById('guide-mismatch').disabled && document.activeElement.id === 'guide-mismatch'`), await js(`JSON.stringify({focus:document.activeElement.id, toast:document.getElementById('toast').textContent, nodes:document.querySelectorAll('#canvas .node').length})`));
  await js(`document.getElementById('guide-mismatch').focus(); true`);
  await key(' ', 'Space', 32);
  check('deliberate mismatch loses readiness and moves focus to repair', await js(`document.getElementById('first-project').textContent.includes('Not ready for interface review') && document.activeElement.id === 'guide-repair'`));
  await js(`document.getElementById('guide-check').focus(); true`);
  await key(' ', 'Space', 32);
  check('walkthrough invokes actual check findings', await js(`document.getElementById('drc-dialog').open && document.getElementById('drc-list').textContent.includes('Required bandwidth exceeds')`));
  await key('Escape', 'Escape', 27);
  await js(`document.getElementById('guide-repair').focus(); true`);
  await key(' ', 'Space', 32);
  check('repair opens existing interface editor on the failing wire', await js(`document.getElementById('engineering-dialog').open && document.querySelector('#engineering-dialog [name=wire]').value === 'w1' && document.querySelector('#engineering-dialog [name=to_rateBps]').value === '9600'`));
  await js(`const f = document.querySelector('#engineering-dialog [name=to_rateBps]'); f.focus(); f.value='115200'; f.dispatchEvent(new Event('input', {bubbles:true})); true`);
  await js(`document.querySelector('#engineering-dialog form button[type=submit]').focus(); true`);
  await key(' ', 'Space', 32);
  await key('Escape', 'Escape', 27);
  check('saving the interface repair restores readiness', await js(`document.getElementById('first-project').textContent.includes('Ready for interface review')`));
  await js(`document.getElementById('guide-check').click(); true`);
  await key('Escape', 'Escape', 27);
  await js(`document.getElementById('guide-export').focus(); true`);
  await key(' ', 'Space', 32);
  check('checked repaired walkthrough exports its current review', await js(`document.querySelector('#first-project [role=status]').textContent.includes('5/5')`));
  await js(`document.getElementById('guide-undo').focus(); true`);
  await key(' ', 'Space', 32);
  check('walkthrough Undo restores mismatch and invalidates old readiness', await js(`document.getElementById('first-project').textContent.includes('Not ready for interface review') && !document.querySelector('#first-project [role=status]').textContent.includes('5/5')`));

  await js(`document.getElementById('btn-connect').focus(); true`);
  await key(' ', 'Space', 32);
  check('connection dialog opens with labelled native endpoint controls', await js(`document.getElementById('connection-dialog').open && document.activeElement.id === 'connect-from-node' && ['connect-from-node','connect-from-port','connect-to-node','connect-to-port','connect-bus'].every(id=>document.querySelector('label[for="'+id+'"]'))`));
  // Choose the host's unused left port and the terminal's unused right port.
  await js(`const to=document.getElementById('connect-to-node');to.value='n5';to.dispatchEvent(new Event('change')); const port=document.getElementById('connect-to-port');port.value='right';port.dispatchEvent(new Event('change')); document.getElementById('connect-from-node').focus(); true`);
  await key('Tab', 'Tab', 9);
  check('Tab reaches the source port selector', await js(`document.activeElement.id === 'connect-from-port'`));
  await key('Tab', 'Tab', 9);
  await key('Tab', 'Tab', 9);
  await key('Tab', 'Tab', 9);
  check('Tab reaches common bus selection', await js(`document.activeElement.id === 'connect-bus' && document.activeElement.value === 'uart'`));
  await key('Enter', 'Enter', 13, 2);
  check('keyboard submit creates exactly one correctly typed wire', await js(`!document.getElementById('connection-dialog').open && document.querySelectorAll('#canvas .wire').length === 5`));
  await js(`document.getElementById('undo').click(); true`);
  check('one Undo removes the keyboard connection', await js(`document.querySelectorAll('#canvas .wire').length === 4`));
  await js(`document.getElementById('btn-connect').focus(); true`);
  await key(' ', 'Space', 32);
  await key('Escape', 'Escape', 27);
  check('Escape cancels wiring and returns focus to its trigger', await js(`!document.getElementById('connection-dialog').open && document.activeElement.id === 'btn-connect' && document.querySelectorAll('#canvas .wire').length === 4`));
  await js(`document.getElementById('guide-starter').click(); true`);
  await sleep(300);
  check('sensor starter remains available and cannot receive the UART mismatch', await js(`document.getElementById('guide-mismatch').disabled && document.querySelectorAll('#canvas .node').length > 0`));
  await js(`document.getElementById('guide-close').click(); true`);
}
