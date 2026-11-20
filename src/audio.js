// Audio stub. No sound yet: every cue is also shown as DOM text, so nothing depends on sound.
// Cue names: 'checkpoint', 'hit', 'win', 'fail'. Put real playback in play() once licensed assets exist.
export function createAudio() {
  let enabled = true;
  return {
    setEnabled(on) { enabled = Boolean(on); },
    get enabled() { return enabled; },
    play(cue) { void cue; },
  };
}
