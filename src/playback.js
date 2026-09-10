// Shared by the editor and the standalone HTML viewer. No DOM dependencies.
export function createPlayback({ advance, changed = () => {}, delay = () => 4000,
  schedule = setTimeout, cancel = clearTimeout }) {
  let playing = false, timer = null, generation = 0;
  function pause() {
    playing = false; generation++;
    if (timer !== null) cancel(timer);
    timer = null; changed(false);
  }
  function queue() {
    const token = ++generation;
    timer = schedule(() => {
      if (!playing || token !== generation) return;
      timer = null;
      if (!advance()) { pause(); return; }
      queue();
    }, Math.max(250, Number(delay()) || 4000));
  }
  return {
    get playing() { return playing; }, pause,
    play() { if (playing) return; playing = true; changed(true); queue(); },
    reschedule() { if (!playing) return; if (timer !== null) cancel(timer); queue(); },
  };
}
