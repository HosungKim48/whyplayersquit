/* whyplayersquit — Home hero wave (DESIGN.md: the one place with motion beyond hover).
   Soft ribbons drawn on a small canvas and blurred by CSS, so each frame is cheap.
   Pauses when the tab is hidden or the hero is off screen; one still frame under prefers-reduced-motion. */
(function () {
  const canvas = document.querySelector(".hero-wave canvas.wave");
  if (!canvas) return;
  const ctx = canvas.getContext("2d");
  const SCALE = 0.25;                      // draw at quarter resolution; CSS blur hides the pixels
  const reduce = window.matchMedia("(prefers-reduced-motion: reduce)");
  // Palette (DESIGN.md): blue ramp + one thin amber strand.
  const RIBBONS = [
    { color: [29, 72, 118], alpha: 0.75, y: 0.58, amp: 0.10, thick: 0.15, k: 1.1, speed: 0.05, phase: 3.1 },
    { color: [43, 102, 166], alpha: 0.55, y: 0.55, amp: 0.12, thick: 0.07, k: 1.5, speed: 0.09, phase: 0.0 },
    { color: [47, 111, 208], alpha: 0.42, y: 0.53, amp: 0.13, thick: 0.045, k: 1.7, speed: -0.07, phase: 1.7 },
    { color: [43, 102, 166], alpha: 0.40, y: 0.57, amp: 0.11, thick: 0.035, k: 2.0, speed: 0.06, phase: 5.2 },
    { color: [245, 165, 36], alpha: 0.32, y: 0.55, amp: 0.12, thick: 0.014, k: 1.6, speed: 0.08, phase: 4.4 },
  ];
  let w = 0, h = 0, raf = 0, visible = true, paused = false, t0 = performance.now();
  const toggle = document.querySelector(".hero-wave .wave-toggle");

  function size() {
    const r = canvas.getBoundingClientRect();
    w = Math.max(1, Math.round(r.width * SCALE));
    h = Math.max(1, Math.round(r.height * SCALE));
    canvas.width = w;
    canvas.height = h;
  }

  function draw(t) {
    ctx.clearRect(0, 0, w, h);
    ctx.globalCompositeOperation = "lighter";
    const steps = Math.max(24, Math.round(w / 4));
    RIBBONS.forEach((r) => {
      const top = [], bot = [];
      for (let i = 0; i <= steps; i++) {
        const u = i / steps, x = u * w;
        const a = u * Math.PI * 2 * r.k;
        const mid = h * (r.y + r.amp * Math.sin(a + t * r.speed * 6 + r.phase) + r.amp * 0.5 * Math.sin(a * 0.55 - t * r.speed * 4 + r.phase * 2));
        const th = h * r.thick * (0.55 + 0.45 * Math.sin(a * 0.8 + t * r.speed * 5 + r.phase));
        top.push([x, mid - th]);
        bot.push([x, mid + th]);
      }
      const g = ctx.createLinearGradient(0, 0, w, 0);
      const [cr, cg, cb] = r.color;
      g.addColorStop(0, `rgba(${cr},${cg},${cb},0)`);
      g.addColorStop(0.25, `rgba(${cr},${cg},${cb},${r.alpha})`);
      g.addColorStop(0.75, `rgba(${cr},${cg},${cb},${r.alpha})`);
      g.addColorStop(1, `rgba(${cr},${cg},${cb},0)`);
      ctx.beginPath();
      top.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
      for (let i = bot.length - 1; i >= 0; i--) ctx.lineTo(bot[i][0], bot[i][1]);
      ctx.closePath();
      ctx.fillStyle = g;
      ctx.fill();
    });
    ctx.globalCompositeOperation = "source-over";
  }

  function frame(now) {
    draw((now - t0) / 1000);
    raf = requestAnimationFrame(frame);
  }
  function start() {
    if (raf || paused || reduce.matches || !visible || document.hidden) return;
    raf = requestAnimationFrame(frame);
  }
  function stop() {
    cancelAnimationFrame(raf);
    raf = 0;
  }
  function still() { stop(); draw(8); }   // a fixed, pleasant moment of the wave

  // WCAG 2.2.2: motion that runs more than 5 s needs a pause control, even when decorative.
  if (toggle) {
    if (reduce.matches) toggle.hidden = true;
    toggle.addEventListener("click", () => {
      paused = !paused;
      toggle.setAttribute("aria-pressed", String(paused));
      toggle.textContent = paused ? "Play motion" : "Pause motion";
      paused ? stop() : start();
    });
  }
  size();
  reduce.matches ? still() : start();
  new ResizeObserver(() => { size(); if (!raf) draw(reduce.matches ? 8 : (performance.now() - t0) / 1000); }).observe(canvas);
  new IntersectionObserver(([e]) => { visible = e.isIntersecting; visible ? start() : stop(); }).observe(canvas);
  document.addEventListener("visibilitychange", () => (document.hidden ? stop() : start()));
  reduce.addEventListener("change", () => { if (toggle) toggle.hidden = reduce.matches; reduce.matches ? still() : start(); });
})();
