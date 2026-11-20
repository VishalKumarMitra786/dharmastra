// Fixed-timestep game loop: update() runs at 60 Hz, render() once per animation frame.
const STEP = 1 / 60;
const MAX_FRAME = 0.1; // clamp long frames (tab switches) so the sim never jumps

export function createLoop({ update, render, raf = requestAnimationFrame, caf = cancelAnimationFrame, now = () => performance.now() }) {
  let id = 0;
  let last = 0;
  let acc = 0;
  let running = false;

  function frame(t) {
    if (!running) return;
    acc += Math.min(MAX_FRAME, (t - last) / 1000);
    last = t;
    while (acc >= STEP) { update(STEP); acc -= STEP; }
    render(acc / STEP);
    id = raf(frame);
  }

  return {
    start() { if (running) return; running = true; last = now(); acc = 0; id = raf(frame); },
    stop() { running = false; caf(id); },
    get running() { return running; },
  };
}
