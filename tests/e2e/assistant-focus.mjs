export async function runAssistantFocusChecks({ js, check, sleep, request = false }) {
  const initial = await js(`(() => {
    const p = document.getElementById('assistant');
    if (p.hidden) document.getElementById('btn-assistant').click();
    document.getElementById('ai-new').click();
    const i = document.getElementById('ai-input');
    return { actions: document.getElementById('ai-actions').getBoundingClientRect().height, input: i.offsetHeight, thread: document.getElementById('ai-thread').offsetHeight };
  })()`);
  check('an empty conversation offers starter actions', initial.actions > 0, JSON.stringify(initial));
  const typing = await js(`(() => {
    const i = document.getElementById('ai-input'); i.value = 'Help me refine this board'; i.dispatchEvent(new Event('input'));
    return { actions: document.getElementById('ai-actions').getBoundingClientRect().height, input: i.offsetHeight, thread: document.getElementById('ai-thread').offsetHeight, options: document.getElementById('ai-options')?.open };
  })()`);
  check('typing hides starters, folds options and gives input and conversation more space', typing.actions === 0 && typing.options === false && typing.input > initial.input && typing.thread > initial.thread, JSON.stringify({ initial, typing }));
  const options = await js(`(() => {
    document.querySelector('#ai-options > summary')?.click();
    const s = document.getElementById('ai-skill'); s.value = 'review'; s.dispatchEvent(new Event('change'));
    const i = document.getElementById('ai-input'); i.value += '!'; i.dispatchEvent(new Event('input'));
    return { open: document.getElementById('ai-options')?.open, skill: s.getBoundingClientRect().height, files: document.querySelector('[data-doc-add]').getBoundingClientRect().height };
  })()`);
  check('options remain accessible and stay open while editing a draft', options.open && options.skill > 0 && options.files > 0, JSON.stringify(options));
  const cleared = await js(`(() => {
    const i = document.getElementById('ai-input'); i.value = ''; i.dispatchEvent(new Event('input'));
    return { actions: document.getElementById('ai-actions').getBoundingClientRect().height, input: i.offsetHeight };
  })()`);
  check('clearing an unsent draft restores the empty state', cleared.actions > 0 && cleared.input === initial.input, JSON.stringify(cleared));
  await js(`document.getElementById('ai-input').value = 'Discard this draft'; document.getElementById('ai-new').click(); true`);
  check('New thread clears the draft and restores the starter actions', await js(`document.getElementById('ai-input').value === '' && document.getElementById('ai-actions').getBoundingClientRect().height > 0`));
  await js(`document.getElementById('ai-skill').value = 'auto'; document.getElementById('ai-skill').dispatchEvent(new Event('change')); true`);
  if (request) {
    const busy = await js(`(() => {
      localStorage.setItem('schematica.ai.settings', JSON.stringify({ provider: 'anthropic', model: 'test-model', baseUrl: location.origin + '/fake', remember: true, tools: true }));
      localStorage.setItem('schematica.ai.key.anthropic', 'sk-fake');
      const i = document.getElementById('ai-input'); i.value = 'Build a sensor board'; i.dispatchEvent(new Event('input'));
      document.querySelector('#ai-options > summary').click();
      document.getElementById('ai-send').click();
      return { options: document.getElementById('ai-options').open, actions: document.getElementById('ai-actions').hidden, stop: document.getElementById('ai-stop').getBoundingClientRect().height, thread: document.getElementById('ai-thread').offsetHeight, panel: document.getElementById('assistant').offsetHeight };
    })()`);
    check('sending folds open options and gives activity most of the panel with Stop visible', !busy.options && busy.actions && busy.stop > 0 && busy.thread > busy.panel / 2, JSON.stringify(busy));
    await js(`document.getElementById('ai-stop').click(); true`);
    for (let i = 0; i < 60 && await js(`!document.getElementById('ai-stop').hidden`); i++) await sleep(50);
    check('stopping a request keeps its conversation visible without starter actions', await js(`document.getElementById('ai-stop').hidden && document.getElementById('ai-actions').hidden && document.querySelectorAll('#ai-thread .ai-msg').length > 0`));
  }
}
