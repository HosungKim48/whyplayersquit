/* whyplayersquit charts. Reads the report snapshot named in <body data-json> (aggregates from scripts/export_site_data.py).
   Every number shown is read from that file; nothing is typed in by hand except event dates/quotes.
   Two modes:
   - Live report pages have one shared filter bar (#filters) that drives every chart, a sidebar with a
     searchable game picker and section links (DESIGN.md "Report page").
   - Archived (frozen) versions have no filter bar; each chart builds its own controls, as before. */
(async function () {
  const blocks = document.querySelectorAll("[data-chart]");
  const GLOBAL = !!document.getElementById("filters");
  const root = document.body.dataset.root || "./";
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);

  /* ---------- searchable dropdown (combobox + listbox) ---------- */
  let comboN = 0;
  function combo({ options, value, onChange, labelledby, label }) {
    const id = `combo${++comboN}`;
    const wrap = document.createElement("div");
    wrap.className = "combo";
    const input = document.createElement("input");
    Object.assign(input, { type: "text", className: "combo-input", autocomplete: "off", spellcheck: false });
    input.setAttribute("role", "combobox");
    input.setAttribute("aria-autocomplete", "list");
    input.setAttribute("aria-expanded", "false");
    input.setAttribute("aria-controls", `${id}-list`);
    if (labelledby) input.setAttribute("aria-labelledby", labelledby); else input.setAttribute("aria-label", label);
    const chev = document.createElement("span");
    chev.className = "combo-chev";
    chev.setAttribute("aria-hidden", "true");
    const list = document.createElement("ul");
    list.className = "combo-list";
    list.id = `${id}-list`;
    list.setAttribute("role", "listbox");
    list.hidden = true;
    let cur = value, active = -1, shown = [];
    const textOf = (v) => (options.find((o) => o[0] === v) || options[0])[1];
    input.value = textOf(cur);
    function setActive(i) {
      active = i;
      list.querySelectorAll('[role="option"]').forEach((li, j) => li.classList.toggle("active", j === i));
      const li = i >= 0 ? list.querySelector(`#${id}-o${i}`) : null;
      if (li) { input.setAttribute("aria-activedescendant", li.id); li.scrollIntoView({ block: "nearest" }); }
      else input.removeAttribute("aria-activedescendant");
    }
    function open(q = "") {
      q = q.toLowerCase().trim();
      shown = options.filter((o) => !q || o[1].toLowerCase().includes(q));
      list.innerHTML = shown.length
        ? shown.map((o, i) => `<li role="option" id="${id}-o${i}" data-i="${i}" aria-selected="${o[0] === cur}">${esc(o[1])}</li>`).join("")
        : `<li class="none">No match</li>`;
      list.hidden = false;
      input.setAttribute("aria-expanded", "true");
      setActive(q ? (shown.length ? 0 : -1) : shown.findIndex((o) => o[0] === cur));
    }
    function close() { list.hidden = true; input.setAttribute("aria-expanded", "false"); setActive(-1); }
    function restore() { input.value = textOf(cur); close(); }
    function choose(i) {
      const o = shown[i];
      if (!o) return;
      cur = o[0];
      input.value = o[1];
      close();
      onChange(cur);
    }
    input.addEventListener("focus", () => { input.select(); open(); });
    input.addEventListener("click", () => { if (list.hidden) open(); });
    input.addEventListener("input", () => open(input.value));
    input.addEventListener("blur", restore);
    input.addEventListener("keydown", (e) => {
      if (e.key === "ArrowDown") { e.preventDefault(); list.hidden ? open() : setActive(Math.min(shown.length - 1, active + 1)); }
      else if (e.key === "ArrowUp") { e.preventDefault(); if (!list.hidden) setActive(Math.max(0, active - 1)); }
      else if (e.key === "Enter") { if (!list.hidden && active >= 0) { e.preventDefault(); choose(active); } }
      else if (e.key === "Escape") { if (!list.hidden) { e.preventDefault(); restore(); } }
    });
    list.addEventListener("mousedown", (e) => {   // keep focus in the input so blur doesn't close first
      e.preventDefault();
      const li = e.target.closest('[role="option"]');
      if (li) choose(Number(li.dataset.i));
    });
    chev.addEventListener("mousedown", (e) => { e.preventDefault(); input.focus(); });
    wrap.append(input, chev, list);
    return wrap;
  }

  /* ---------- sidebar: game picker + section links (live report) ---------- */
  (function sidebar() {
    const picker = document.querySelector(".game-picker");
    const gamesNode = document.getElementById("qs-games");
    if (picker && gamesNode) {
      const games = JSON.parse(gamesNode.textContent);
      // Preview builds point folder links at index.html; follow the same rule for the picker.
      const fix = (h) => (location.pathname.endsWith("/index.html") && h.endsWith("/") ? h + "index.html" : h);
      const current = games.find((g) => g.current) || games[0];
      picker.append(combo({
        options: games.map((g) => [g.href, g.name]), value: current.href, labelledby: picker.dataset.label,
        onChange: (href) => { if (href !== current.href) location.href = fix(href); },
      }));
    }
    const links = [...document.querySelectorAll(".side-nav a")];
    if (!links.length) return;
    const targets = links.map((a) => document.getElementById(a.getAttribute("href").slice(1)));
    let ticking = false;
    const spy = () => {
      ticking = false;
      let k = 0;
      targets.forEach((t, i) => { if (t && t.getBoundingClientRect().top < 140) k = i; });
      links.forEach((a, i) => (i === k ? a.setAttribute("aria-current", "true") : a.removeAttribute("aria-current")));
    };
    addEventListener("scroll", () => { if (!ticking) { ticking = true; requestAnimationFrame(spy); } }, { passive: true });
    spy();
  })();

  if (!blocks.length) return;
  let D;
  try {
    D = await fetch(root + document.body.dataset.json).then((r) => r.json());
  } catch (e) {
    blocks.forEach((b) => (b.querySelector(".chart").textContent = "Chart data could not be loaded."));
    return;
  }

  const L = D.labels, B = D.buckets;
  // Dark theme (DESIGN.md). Categorical = analyze.py hues where they survive the dark panel; the amber and
  // green slots were replaced (UI-accent clash, color-blind collisions). Checked by scripts/check_chart_colors.py.
  const PAL = ["#2F6FD0", "#E0592A", "#1BAF7A", "#FFE0B2", "#F29BC0", "#CFC7FF"];   // amber slot moved off amber (reserved for UI)
  const GRAY = "#7D8791";                          // "other" / not-decisive (text3, 4.9:1)
  const INK = "#E6EAED", INK2 = "#A3ADB6", INK3 = "#7D8791";
  const PANEL = "#12171C", BG = "#0B0E11", RULE = "#3A4651";
  const ACCENT = "#F5A524", ON_ACCENT = "#0B0E11";
  const BLUE = PAL[0], ORANGE = PAL[1];
  const SEQ = ["#122638", "#173757", "#1D4876", "#24578F", "#2B66A6"];   // low -> high; top step keeps light labels >= 4.5:1
  const MONO = "IBM Plex Mono, ui-monospace, monospace", SANS = "IBM Plex Sans, system-ui, sans-serif";
  const TIP = { fill: BG, stroke: RULE };
  // WCAG helpers: pick the label color with the higher contrast on a fill.
  const lum = (hex) => { const c = d3.rgb(hex); return [c.r, c.g, c.b].map((v) => { v /= 255; return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }).reduce((s, v, i) => s + v * [0.2126, 0.7152, 0.0722][i], 0); };
  const contrast = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((m, n) => n - m); return (x + 0.05) / (y + 0.05); };
  const textOn = (fill) => (contrast(fill, INK) >= contrast(fill, BG) ? INK : BG);
  const mix = (a, b, t) => d3.interpolateRgb(b, a)(t);   // t = share of a over b
  const fmt = d3.format(",");
  const BL = (b) => b.replace("-", "–");
  const LANG = { english: "English", schinese: "Simplified Chinese", russian: "Russian", german: "German",
    koreana: "Korean", tchinese: "Traditional Chinese", brazilian: "Portuguese (Brazil)" };
  // Shared state. In archive mode only `win` is shared (the event toggles stay in sync); the rest is per chart.
  const DEFAULTS = { win: "all", bucket: "all", basis: "primary", lang: "all", reason: "" };
  const state = { ...DEFAULTS };
  // Event-window label, e.g. "Oct 22–24", from the snapshot (analyze.py EVENT).
  const dayFmt = (s) => d3.utcFormat("%b %-d")(new Date(s + "T00:00:00Z"));
  // Games without a review-spike window (event_window null) get no exclude toggle.
  const EV = D.meta.event_window && (({ first, last }) => first.slice(0, 7) === last.slice(0, 7) ? `${dayFmt(first)}–${last.slice(8).replace(/^0/, "")}` : `${dayFmt(first)} – ${dayFmt(last)}`)(D.meta.event_window);
  const renderers = [];
  const win = () => D.windows[state.win];
  const sign = (v) => (v > 0 ? "+" : v < 0 ? "−" : "") + Math.abs(v).toFixed(1);
  const lit = (code) => !state.reason || state.reason === code;   // highlight-a-reason: is this mark in focus?

  /* ---------- shared controls ---------- */
  function seg(options, current, onChange, label) {
    const g = document.createElement("div");
    g.className = "seg";
    g.setAttribute("role", "group");
    if (label) g.setAttribute("aria-label", label);
    options.forEach(([value, text]) => {
      const b = document.createElement("button");
      b.type = "button";
      b.textContent = text;
      b.setAttribute("aria-pressed", String(value === current));
      b.addEventListener("click", () => {
        g.querySelectorAll("button").forEach((x) => x.setAttribute("aria-pressed", "false"));
        b.setAttribute("aria-pressed", "true");
        onChange(value);
      });
      g.appendChild(b);
    });
    return g;
  }
  function eventToggle() {
    if (!EV || GLOBAL) return document.createTextNode("");
    const l = document.createElement("label");
    l.innerHTML = `<input type="checkbox" class="ev-toggle"> Exclude ${EV} review spike`;
    const cb = l.querySelector("input");
    cb.checked = state.win === "noevent";
    cb.addEventListener("change", () => {
      state.win = cb.checked ? "noevent" : "all";
      document.querySelectorAll(".ev-toggle").forEach((x) => (x.checked = cb.checked));
      renderAll();
    });
    return l;
  }
  // Filters a chart can't use are named under its title instead of being silently ignored.
  const ACTIVE = { bucket: () => state.bucket !== "all", basis: () => state.basis !== "primary", lang: () => state.lang !== "all" };
  const FNAME = { bucket: "Hours played", basis: "Any mention", lang: "Language" };
  function eventNote(el, ignores, extra) {
    const n = el.querySelector(".event-note");
    if (!n) return;
    const msgs = [];
    if (state.win === "noevent") msgs.push(GLOBAL ? `${EV} spike excluded: ${fmt(D.windows.noevent.n)} reviews (${fmt(D.meta.event_reviews)} left out).` : `Showing ${fmt(D.windows.noevent.n)} reviews: the ${fmt(D.meta.event_reviews)} written ${EV} are left out.`);
    if (GLOBAL) {
      const off = (ignores || []).filter((k) => ACTIVE[k]()).map((k) => FNAME[k]);
      if (off.length) msgs.push(`Not applied here: ${off.join(", ")}.`);
    }
    if (extra) msgs.push(extra);
    n.textContent = msgs.join(" ");
  }
  function renderAll() { renderers.forEach((r) => r()); if (GLOBAL) chips(); }

  /* ---------- the shared filter bar (live report) ---------- */
  function buildFilters() {
    const box = document.querySelector("#filters .filter-groups");
    box.replaceChildren();
    let gid = 0;
    const group = (label, make) => {
      const g = document.createElement("div");
      g.className = "fgroup";
      const lab = document.createElement("span");
      lab.className = "flabel";
      lab.id = `flabel${++gid}`;
      lab.textContent = label;
      g.append(lab, make(lab.id));
      box.append(g);
    };
    const set = (k) => (v) => { state[k] = v; renderAll(); };
    group("Hours played", () => seg([["all", "All"], ...B.map((b) => [b, BL(b)])], state.bucket, set("bucket"), "Hours played"));
    group("Reason", () => seg([["primary", "Main reason"], ["mentions", "Any mention"]], state.basis, set("basis"), "Reason basis"));
    if (EV) group(`${EV} spike`, () => seg([["all", "Include"], ["noevent", "Exclude"]], state.win, set("win"), `${EV} review spike`));
    group("Language", (id) => combo({ options: [["all", `All ${D.meta.languages} languages`], ...D.top_langs.map((l) => [l, LANG[l] || l])], value: state.lang, onChange: set("lang"), labelledby: id }));
    group("Highlight a reason", (id) => combo({ options: [["", "None"], ...D.codes.map((c) => [c, L[c]])], value: state.reason, onChange: set("reason"), labelledby: id }));
    const reset = document.createElement("button");
    reset.type = "button";
    reset.className = "reset";
    reset.textContent = "Reset";
    reset.addEventListener("click", () => { Object.assign(state, DEFAULTS); buildFilters(); renderAll(); });
    box.append(reset);
  }
  // Active-filter chips (Baymard): every non-default filter as a removable chip; doubles as a polite live status.
  const CHIP = {
    bucket: () => `Hours: ${BL(state.bucket)}`, basis: () => "Any mention", win: () => `${EV} spike excluded`,
    lang: () => `Language: ${LANG[state.lang] || state.lang}`, reason: () => `Highlight: ${L[state.reason]}`,
  };
  function chips() {
    let box = document.querySelector("#filters .chips");
    if (!box) {
      box = document.createElement("div");
      box.className = "chips";
      box.setAttribute("aria-live", "polite");
      document.getElementById("filters").append(box);
    }
    const on = Object.keys(CHIP).filter((k) => state[k] !== DEFAULTS[k]);
    box.innerHTML = on.length
      ? on.map((k) => `<button type="button" class="chip" data-k="${k}" aria-label="Remove filter: ${esc(CHIP[k]())}">${esc(CHIP[k]())}<i aria-hidden="true"></i></button>`).join("")
      : `<span class="chips-none">All reviews · all languages</span>`;
    box.querySelectorAll(".chip").forEach((b) => b.addEventListener("click", () => { state[b.dataset.k] = DEFAULTS[b.dataset.k]; buildFilters(); renderAll(); }));
  }
  if (GLOBAL) { buildFilters(); chips(); }

  // Make data marks reachable by keyboard; their aria-label carries the value.
  function focusable(svg) {
    svg.querySelectorAll("circle[aria-label], rect[aria-label], path[aria-label]").forEach((m) => { m.setAttribute("tabindex", "0"); m.setAttribute("role", "img"); });
  }

  function setup(el, build, ignores) {
    const chart = el.querySelector(".chart");
    let lastW = 0, timer;
    const render = () => { lastW = chart.clientWidth; chart.replaceChildren(); const extra = build(chart, chart.clientWidth); chart.querySelectorAll("svg").forEach(focusable); eventNote(el, ignores, extra); };
    renderers.push(render);
    new ResizeObserver(() => {
      clearTimeout(timer);
      timer = setTimeout(() => { if (Math.abs(chart.clientWidth - lastW) > 4) render(); }, 120);
    }).observe(chart);
    render();
  }

  // Push overlapping text labels apart vertically (simple declutter for the dot chart).
  function declutter(svg, className) {
    const g = svg.querySelector(`g.${className}`);
    if (!g) return;
    // Screen boxes include each label's own translate(); getBBox() would not.
    const items = [...g.querySelectorAll("text")].map((t) => {
      const r = t.getBoundingClientRect();
      return { t, b: { x: r.left, y: r.top, width: r.width, height: r.height }, dy: 0 };
    });
    items.sort((a, b) => a.b.y - b.b.y);
    for (let pass = 0; pass < 6; pass++) {
      for (let i = 0; i < items.length; i++) for (let j = i + 1; j < items.length; j++) {
        const a = items[i], c = items[j];
        const ay = a.b.y + a.dy, cy = c.b.y + c.dy;
        const overlapX = a.b.x < c.b.x + c.b.width && c.b.x < a.b.x + a.b.width;
        const overlapY = ay < cy + c.b.height && cy < ay + a.b.height;
        if (overlapX && overlapY) {
          const push = (a.b.height - Math.abs(cy - ay)) / 2 + 1;
          if (cy >= ay) { a.dy -= push; c.dy += push; } else { a.dy += push; c.dy -= push; }
        }
      }
    }
    items.forEach(({ t, dy }) => { if (dy) t.setAttribute("transform", `translate(0,${dy.toFixed(1)}) ` + (t.getAttribute("transform") || "")); });
  }

  /* ---------- 1. Loud vs decisive ---------- */
  const SIG = (el) => {
    const loc = { bucket: "all" };
    const S = () => (GLOBAL ? state : loc);
    if (!GLOBAL) el.querySelector(".controls").append(seg([["all", "All players"], ...B.map((b) => [b, BL(b)])], loc.bucket, (v) => { loc.bucket = v; renderAll(); }, "Playtime group"), eventToggle());
    const draw = (chart, w) => {
      const bucket = S().bucket;
      const pts = win().signature[bucket];
      const maxShare = d3.max(pts, (d) => d.share), maxN = d3.max(pts, (d) => d.n);
      const rMax = 7;   // plain dots: area reads poorly (Heer & Bostock 2010); n shows as opacity
      const rpx = () => rMax;
      const narrow = w < 520;
      const liftRange = d3.max(pts, (d) => d.lift) - d3.min(pts, (d) => d.lift);
      const SHORT = { cheaters: "Cheaters", balance: "Balance", grind_gear_gap: "Grind", ping_cap_region_access: "Ping cap",
        progression_wipe: "Wipe", gameplay_design: "Gameplay", developer_trust_enforcement: "Dev trust", technical_client: "Technical",
        servers_access: "Servers", social_teammates: "Social", price_value: "Price" };
      const text = (d) => `${narrow ? (SHORT[d.code] || d.label) : d.label} ${sign(d.lift)}`;
      // Choose each label's side: estimate its width in x-units and avoid dots it would run into.
      const pxPerUnit = (w - 60) / (maxShare * 1.08);
      const charPx = narrow ? 6.2 : 6.8;
      const near = (o, d) => Math.abs(o.lift - d.lift) < liftRange * 0.07;
      const lab = pts.map((d) => {
        const span = (text(d).length * charPx + rpx(d.n) + 6) / pxPerUnit;
        const hitsRight = d.share + span > maxShare * 1.08 || pts.some((o) => o !== d && near(o, d) && o.share > d.share && o.share < d.share + span);
        const hitsLeft = d.share - span < 0 || pts.some((o) => o !== d && near(o, d) && o.share < d.share && o.share > d.share - span);
        const r = rpx(d.n);
        if (hitsRight && hitsLeft) return { ...d, anchor: "middle", dx: 0, dy: -(r + 9) }; // both sides blocked: above
        const left = hitsRight;
        return { ...d, anchor: left ? "end" : "start", dx: (left ? -1 : 1) * (r + 4), dy: 0 };
      });
      const groupWord = bucket === "all" ? "its playtime mix" : `all ${BL(bucket)} reviewers`;
      const svg = Plot.plot({
        width: w, height: narrow ? 460 : 500, marginLeft: 46, marginRight: 14, marginTop: 28, marginBottom: 46,
        style: { fontFamily: MONO, fontSize: narrow ? "11px" : "12px", color: INK3 },
        x: { label: narrow ? "Share of negative reviews →" : "Share of negative reviews where it is the main reason →", grid: true, tickFormat: (d) => d + "%", domain: [0, maxShare * 1.08], nice: true, labelAnchor: "right" },
        y: { label: narrow ? "↑ Stops more than similar players (pts)" : "↑ Stops more than players with similar hours (points)", grid: true, nice: true, tickFormat: (d) => (d > 0 ? "+" : "") + d, labelAnchor: "top" },
        marks: [
          Plot.ruleY([0], { stroke: INK2, strokeWidth: 1 }),
          Plot.text(["More likely to stop than their group ↑"], { frameAnchor: "top-right", dy: 2, fill: ACCENT, fontWeight: 500 }),
          Plot.text(["↓ Less likely to stop"], { frameAnchor: "bottom-right", dy: -4, fill: INK2, fontWeight: 500 }),
          Plot.dot(lab, {
            x: "share", y: "lift", r: rMax, ariaLabel: (d) => `${d.label}: main reason in ${d.share}% of negative reviews, stop rate ${d.rate}%, lift ${sign(d.lift)} points, ${fmt(d.n)} reviewers`,
            fill: (d) => (d.lift > 0 ? ACCENT : GRAY), fillOpacity: (d) => (!lit(d.code) ? 0.12 : d.small ? 0.3 : 0.9),
            stroke: (d) => (state.reason === d.code ? INK : PANEL), strokeWidth: 1.5,
            title: (d) => `${d.label}\nMain reason in ${d.share}% of negative reviews (${fmt(d.primary_n)} of ${fmt(d.bucket_n)})\n` +
              `Stop rate ${d.rate}% vs ${d.expected}% for ${groupWord}\nLift ${sign(d.lift)} pts · ${fmt(d.n)} judged reviewers${d.small ? " (fewer than 100: faded)" : ""}`,
            tip: TIP,
          }),
          Plot.text(lab, {
            x: "share", y: "lift", text, textAnchor: "start",
            fill: INK, fillOpacity: (d) => (!lit(d.code) ? 0.25 : d.small ? 0.6 : 1), fontFamily: SANS, fontWeight: 500, className: "sig-labels",
          }),
        ],
      });
      chart.append(svg);
      // Per-label offset (Plot's dx is one constant), then push overlapping labels apart.
      svg.querySelectorAll('g.sig-labels text').forEach((t, i) => {
        t.setAttribute("text-anchor", lab[i].anchor);
        t.setAttribute("dx", lab[i].dx.toFixed(1));
        if (lab[i].dy) t.setAttribute("dy", lab[i].dy.toFixed(1));
      });
      declutter(svg, "sig-labels");
      if (state.reason && !pts.some((d) => d.code === state.reason)) return `${L[state.reason]} is not shown in this chart.`;
    };
    return [draw, ["basis", "lang"]];
  };

  const seqColor = d3.scaleLinear().domain([0, 0.25, 0.5, 0.75, 1]).range(SEQ).interpolate(d3.interpolateRgb);

  /* ---------- 2. Reason explorer (heatmap) ---------- */
  const EXPLORER = (el) => {
    const loc = { basis: "primary", lang: "all", bucket: "all" };
    const S = () => (GLOBAL ? state : loc);
    if (!GLOBAL) {
      const sel = document.createElement("select");
      sel.setAttribute("aria-label", "Review language");
      const opts = [["all", `All ${D.meta.languages} languages`], ...D.top_langs.map((l) => [l, LANG[l] || l])];
      sel.innerHTML = opts.map(([v, t]) => `<option value="${v}">${t}</option>`).join("");
      sel.addEventListener("change", () => { loc.lang = sel.value; renderAll(); });
      el.querySelector(".controls").append(seg([["primary", "Main reason"], ["mentions", "Any mention"]], loc.basis, (v) => { loc.basis = v; renderAll(); }, "Count"), sel, eventToggle());
    }
    // Live report: small multiples, one panel per playtime group, top 5 reasons, shared scale (values on aligned bars).
    const multiples = (chart) => {
      const { basis: metric, lang, bucket } = state;
      const c = win().counts[lang];
      const panels = B.map((b) => {
        const n = c.n[b];
        const rows = D.codes.map((code) => ({ code, v: n ? (c[metric][b][code] / n) * 100 : 0, k: c[metric][b][code] }))
          .sort((x, y) => y.v - x.v).slice(0, 5);
        return { b, n, rows };
      });
      const max = d3.max(panels, (p) => d3.max(p.rows, (r) => r.v)) || 1;
      chart.innerHTML = `<div class="multiples">${panels.map((p) => `<div class="mpanel${bucket !== "all" && p.b !== bucket ? " dim" : ""}${p.n < 100 ? " small" : ""}">` +
        `<p class="mhead"><b>${BL(p.b)}</b><span>n = ${fmt(p.n)}</span></p>` +
        p.rows.map((r) => `<div class="mrow${state.reason ? (state.reason === r.code ? " hl" : " fade") : ""}" title="${esc(L[r.code])} · ${BL(p.b)}: ${fmt(r.k)} of ${fmt(p.n)} (${r.v.toFixed(1)}%)">` +
          `<span class="mlab">${esc(L[r.code])}</span><span class="mbar"><i style="width:${(r.v / max * 100).toFixed(1)}%"></i></span><span class="mval">${Math.round(r.v)}%</span></div>`).join("") +
        `</div>`).join("")}</div>`;
      el.querySelector(".foot").textContent = metric === "mentions" ? "Any mention = main or secondary reason, so shares add to more than 100%." : "Main reason only. Hover a bar for counts.";
      if (state.reason && !panels.some((p) => p.rows.some((r) => r.code === state.reason))) return `${L[state.reason]} is not in any group's top 5.`;
    };
    const draw = (chart, w) => {
      if (GLOBAL) return multiples(chart);
      const { basis: metric, lang, bucket } = S();
      const c = win().counts[lang];
      const cells = [];
      D.codes.forEach((code) => B.forEach((b) => {
        const n = c.n[b], k = c[metric][b][code];
        const dim = !lit(code) || (bucket !== "all" && b !== bucket);
        cells.push({ code, reason: L[code], bucket: b, k, n, v: n ? (k / n) * 100 : 0, small: n < 100, dim });
      }));
      const max = d3.max(cells, (d) => d.v);
      const narrow = w < 520;
      const nTot = B.reduce((s, b) => s + c.n[b], 0);
      const svg = Plot.plot({
        width: w, height: narrow ? 470 : 500, marginLeft: narrow ? 120 : 150, marginTop: 44, marginBottom: 8, padding: 0.04,
        style: { fontFamily: MONO, fontSize: narrow ? "11px" : "12px", color: INK3 },
        x: { domain: B, axis: "top", label: narrow ? "Hours played at review" : null, labelAnchor: "center", tickSize: 0, tickFormat: (b) => (narrow ? BL(b).replace("h", "") : `${BL(b)}\nn=${fmt(c.n[b])}`) },
        y: { domain: D.codes.map((x) => L[x]), label: null, tickSize: 0 },
        color: { type: "linear", domain: [0, max * 0.25, max * 0.5, max * 0.75, max], range: SEQ, interpolate: "rgb" },
        marks: [
          Plot.cell(cells, { x: "bucket", y: "reason", fill: "v", ariaLabel: (d) => `${d.reason}, ${BL(d.bucket)}: ${d.v.toFixed(1)}% (${fmt(d.k)} of ${fmt(d.n)})`, fillOpacity: (d) => (d.dim ? 0.2 : d.small ? 0.35 : 1), inset: 1, rx: 3,
            title: (d) => `${d.reason} · ${BL(d.bucket)}\n${fmt(d.k)} of ${fmt(d.n)} reviews (${d.v.toFixed(1)}%)${d.small ? "\nFewer than 100 reviews in this group" : ""}`, tip: TIP }),
          Plot.text(cells, { x: "bucket", y: "reason", text: (d) => d.v.toFixed(0) + "%", fill: (d) => (d.dim ? INK3 : d.small ? INK2 : textOn(seqColor(d.v / max))), pointerEvents: "none" }),
        ],
      });
      chart.append(svg);
      const foot = el.querySelector(".foot");
      foot.textContent = `${fmt(nTot)} reviews in this view. Columns = playtime at review. ` +
        (metric === "mentions" ? "Any mention = main or secondary reason, so columns add to more than 100%. " : "Each column adds to 100%. ") +
        (cells.some((d) => d.small) ? "Faded columns have fewer than 100 reviews." : "");
    };
    return [draw, []];
  };

  /* ---------- 3. Quit-signal table ---------- */
  const ORDER = ["ping_cap_region_access", "progression_wipe", "developer_trust_enforcement", "gameplay_design", "grind_gear_gap",
    "cheaters", "balance", "technical_client", "servers_access", "social_teammates", "price_value", "unclear_other"];
  const QS = (el) => {
    const loc = { basis: "primary", bucket: "all" };
    const S = () => (GLOBAL ? state : loc);
    if (!GLOBAL) el.querySelector(".controls").append(seg([["primary", "Main reason"], ["mentions", "Any mention"]], loc.basis, (v) => { loc.basis = v; renderAll(); }, "Reason basis"), eventToggle());
    const draw = (chart) => {
      const { basis, bucket } = S();
      const st = win().stop;
      const base = Object.fromEntries(B.map((b) => [b, st[b].stopped / st[b].n * 100]));
      const colDim = (b) => (bucket !== "all" && b !== bucket ? " dimcol" : "");
      let h = `<div class="table-wrap"><table class="qs-table"><thead><tr><th>${basis === "primary" ? "Main reason" : "Reason mentioned"}</th>${B.map((b) => `<th class="${colDim(b)}">${BL(b)}</th>`).join("")}</tr></thead><tbody>`;
      h += `<tr class="base"><td>All reviewers in group</td>${B.map((b) => `<td class="cell${colDim(b)}" tabindex="0">${Math.round(base[b])}%<span class="tip">All ${BL(b)} reviewers: ${fmt(st[b].stopped)} of ${fmt(st[b].n)} stopped (${base[b].toFixed(1)}%). This is the group average.</span></td>`).join("")}</tr>`;
      // Known codes in the fixed order; a game-specific codebook's extra codes go after them.
      [...ORDER.filter((c) => D.codes.includes(c)), ...D.codes.filter((c) => !ORDER.includes(c))].forEach((code) => {
        const rowCls = state.reason ? (state.reason === code ? "hl" : "dim") : "";
        h += `<tr class="${rowCls}"><td>${L[code]}</td>`;
        B.forEach((b) => {
          const x = st[b][basis][code];
          if (!x.n) { h += `<td class="${colDim(b)}">–</td>`; return; }
          const r = x.stopped / x.n * 100, diff = r - base[b], small = x.n < 100;
          const a = Math.min(1, Math.abs(diff) / 30);
          // Solid blend over the panel so the label color can be chosen for contrast (>= 4.5:1).
          const bg = small ? "" : diff >= 0 ? mix(ORANGE, PANEL, 0.15 + a * 0.6) : mix(BLUE, PANEL, 0.12 + a * 0.6);   // warm = stops more (matches home); caps keep light text >= 4.6:1
          const fg = small ? "" : textOn(bg);
          h += `<td class="cell${small ? " small-n" : ""}${colDim(b)}" tabindex="0" style="background:${bg};${fg ? "color:" + fg : ""}">${Math.round(r)}%${small ? "*" : ""}` +
            `<span class="tip"><b>${L[code]} · ${BL(b)}</b><br>${fmt(x.stopped)} of ${fmt(x.n)} stopped (${r.toFixed(1)}%)<br>Group average ${base[b].toFixed(1)}% → ${sign(diff)} pts${small ? "<br>Fewer than 100 reviewers: read with care" : ""}</span></td>`;
        });
        h += `</tr>`;
      });
      h += `</tbody></table></div>`;
      chart.innerHTML = h;
    };
    return [draw, ["lang"]];
  };

  /* ---------- 4. Timeline ---------- */
  // Events come from the project registry (site/_src/projects.json), injected by build_site.py as JSON.
  // Each lands on the week that contains its date; its stat line is filled from this report's data.
  const REG = (() => { const n = document.getElementById("qs-events"); return n ? JSON.parse(n.textContent) : []; })();
  const weekOf = (w, date) => { let k = -1; w.weeks.forEach((start, i) => { if (start <= date) k = i; }); return k; };
  const EVENTS = REG.map((e) => ({ ...e, week: weekOf(D.windows.all.weekly, e.date) })).filter((e) => e.week >= 0);
  const fill = (tpl, w, i) => tpl.replace(/\{(s|c|p|t)(?::([a-z_]+))?(?::(-?\d+))?\}/g, (_, k, code, off) => {
    const j = i + Number(off || 0);
    const cnt = (c) => (w.series[c] || w.by_code[c])[j];
    if (k === "t") return fmt(tot(w, j));
    if (k === "p") return pct(cnt(code), tot(w, j));
    if (k === "c") return fmt(w.by_code[code][j]);
    return fmt(cnt(code));
  });
  const tot = (w, i) => Object.values(w.series).reduce((s, a) => s + a[i], 0);
  const pct = (k, n) => `${Math.round((k / n) * 100)}%`;
  const TIMELINE = (el) => {
    let active = Math.min(1, EVENTS.length - 1);
    el.querySelector(".controls").append(eventToggle());
    const groups = [...D.top6, "other"];
    const colors = [...PAL.slice(0, 6), "#5B6570"];
    const name = (g) => (g === "other" ? "Other (incl. unclear)" : L[g]);
    el.querySelector(".legend").innerHTML = groups.map((g, i) => `<span><i style="background:${colors[i]}"></i>${name(g)}</span>`).join("");
    const chips = el.querySelector(".event-chips");
    const panel = el.querySelector(".event-panel");
    EVENTS.forEach((e, i) => {
      const b = document.createElement("button");
      b.type = "button";
      b.textContent = `${i + 1} · ${e.short} (${e.label})`;
      b.addEventListener("click", () => select(i));
      chips.appendChild(b);
    });
    function select(i) {
      if (!EVENTS.length) return;
      active = i;
      chips.querySelectorAll("button").forEach((b, j) => b.setAttribute("aria-pressed", String(j === i)));
      const e = EVENTS[i], w = win().weekly;
      panel.innerHTML = `<h4>${e.title}</h4><p>${e.what}</p><p>${fill(e.stat, w, e.week)}</p><blockquote>“${e.quote}”<span class="who">${e.who}, paraphrased</span></blockquote>` +
        (e.sources ? `<p class="sources">Source: ${e.sources.map((s) => `<a href="${s.url}" rel="noopener">${s.label}</a>`).join(" · ")}</p>` : "");
      el.querySelectorAll('g.event-marker circle').forEach((c, j) => { c.setAttribute("fill", j === i ? ACCENT : PANEL); c.setAttribute("stroke", j === i ? ACCENT : INK2); });
      el.querySelectorAll('g.event-marker-text text').forEach((t, j) => t.setAttribute("fill", j === i ? ON_ACCENT : INK));
    }
    const draw = (chart, w) => {
      const wk = win().weekly;
      const narrow = w < 560;
      // Highlight a reason: reasons outside the top six are drawn inside "Other".
      const focus = state.reason ? (D.top6.includes(state.reason) ? state.reason : "other") : "";
      const label = (s) => d3.utcFormat("%b %d")(new Date(s + "T00:00:00Z"));
      const weeks = wk.weeks.map(label);
      const rows = [];
      wk.weeks.forEach((_, i) => groups.forEach((g) => rows.push({ week: weeks[i], g: name(g), code: g, k: wk.series[g][i], i })));
      const totals = weeks.map((x, i) => ({ week: x, t: tot(wk, i) }));
      const maxT = d3.max(totals, (d) => d.t);
      const markers = EVENTS.map((e, i) => ({ week: weeks[e.week], n: i + 1, short: e.short }));
      if (GLOBAL) {   // live report: one line per reason, labelled at its end; updates as dashed rules (no stacked bars)
        el.querySelector(".legend").innerHTML = "";
        const maxK = d3.max(rows, (d) => d.k);
        const last = rows.filter((d) => d.i === weeks.length - 1);
        const col = (d) => (focus && d.code !== focus ? "#3A4651" : colors[groups.indexOf(d.code)]);
        const svg = Plot.plot({
          width: w, height: narrow ? 360 : 420, marginLeft: narrow ? 40 : 50, marginRight: narrow ? 92 : 150, marginTop: 40, marginBottom: narrow ? 46 : 34,
          style: { fontFamily: MONO, fontSize: narrow ? "10.5px" : "12px", color: INK3 },
          x: { domain: weeks, type: "point", label: null, tickSize: 0, padding: 0.3, tickRotate: narrow ? -45 : 0 },
          y: { label: "↑ Negative reviews per week", grid: true, domain: [0, maxK * 1.18], tickFormat: narrow ? d3.format("~s") : d3.format(",") },
          marks: [
            Plot.ruleX(markers, { x: "week", stroke: INK3, strokeDasharray: "3,4", strokeWidth: 1 }),
            Plot.line(rows, { x: "week", y: "k", z: "g", stroke: col, strokeWidth: (d) => (focus && d.code === focus ? 3 : 2) }),
            Plot.dot(rows, { x: "week", y: "k", r: 3, fill: col, ariaLabel: (d) => `Week of ${d.week}, ${d.g}: ${fmt(d.k)}`, title: (d) => `Week of ${d.week}\n${d.g}: ${fmt(d.k)} (${pct(d.k, tot(wk, d.i))})`, tip: TIP }),
            Plot.text(last, { x: "week", y: "k", text: (d) => (narrow ? d.g.split(/[ &(]/)[0] : d.g), dx: 8, textAnchor: "start", fill: col, fontFamily: SANS, fontWeight: 500, className: "tl-labels" }),
            Plot.dot(markers, { x: "week", y: maxK * 1.1, r: 11, fill: PANEL, stroke: INK2, strokeWidth: 1.5, className: "event-marker" }),
            Plot.text(markers, { x: "week", y: maxK * 1.1, text: "n", fill: INK, fontWeight: 500, pointerEvents: "none", className: "event-marker-text" }),
          ],
        });
        chart.append(svg);
        declutter(svg, "tl-labels");
        svg.querySelectorAll('g.event-marker circle').forEach((c, i) => {
          c.style.cursor = "pointer"; c.setAttribute("tabindex", "0"); c.setAttribute("role", "button"); c.setAttribute("aria-label", EVENTS[i].title);
          c.addEventListener("click", () => select(i));
          c.addEventListener("keydown", (ev) => { if (ev.key === "Enter" || ev.key === " ") { ev.preventDefault(); select(i); } });
        });
        select(active);
        if (focus === "other") return `${L[state.reason]} is counted under “Other” here.`;
        return;
      }
      const svg = Plot.plot({
        width: w, height: narrow ? 360 : 420, marginLeft: narrow ? 40 : 50, marginTop: 34, marginBottom: narrow ? 46 : 34,
        style: { fontFamily: MONO, fontSize: narrow ? "10.5px" : "12px", color: INK3 },
        x: { domain: weeks, label: null, tickSize: 0, padding: 0.18, tickRotate: narrow ? -45 : 0 },
        y: { label: "↑ Negative reviews per week", grid: true, domain: [0, maxT * 1.2], tickFormat: narrow ? d3.format("~s") : d3.format(",") },
        color: { domain: groups.map(name), range: colors },
        marks: [
          Plot.barY(rows, { x: "week", y: "k", fill: "g", fillOpacity: (d) => (focus && d.code !== focus ? 0.2 : 1), order: groups.map(name), ariaLabel: (d) => `Week of ${d.week}, ${d.g}: ${fmt(d.k)}`, title: (d) => `Week of ${d.week}${d.i === weeks.length - 1 ? " (8 days)" : ""}\n${d.g}: ${fmt(d.k)} (${pct(d.k, tot(wk, d.i))})`, tip: TIP }),
          Plot.text(totals, { x: "week", y: "t", text: (d) => (narrow ? d3.format(".2~s")(d.t) : fmt(d.t)), dy: -7, fill: INK2 }),
          Plot.dot(markers, { x: "week", y: maxT * 1.12, r: narrow ? 11 : 11, fill: PANEL, stroke: INK2, strokeWidth: 1.5, className: "event-marker" }),
          Plot.text(markers, { x: "week", y: maxT * 1.12, text: "n", fill: INK, fontWeight: 500, pointerEvents: "none", className: "event-marker-text" }),
        ],
      });
      chart.append(svg);
      svg.querySelectorAll('g.event-marker circle').forEach((c, i) => {
        c.style.cursor = "pointer";
        c.setAttribute("tabindex", "0");
        c.setAttribute("role", "button");
        c.setAttribute("aria-label", EVENTS[i].title);
        c.addEventListener("click", () => select(i));
        c.addEventListener("keydown", (ev) => { if (ev.key === "Enter" || ev.key === " ") { ev.preventDefault(); select(i); } });
      });
      select(active);
      if (focus === "other") return `${L[state.reason]} is counted under “Other” in this chart.`;
    };
    return [draw, ["bucket", "basis", "lang"]];
  };

  /* ---------- 5. This week's top reasons (rank table with change badges) ---------- */
  const RANKT = (el) => {
    let sortKey = "rank", sortDir = 1;   // 1 = ascending
    const COLS = [
      ["rank", "#", "num"], ["change", "Change", "num"], ["label", "Reason", ""],
      ["share", "Share this week", "num"], ["k", "Reviews", "num"], ["sp", "Share last week", "num"], ["delta", "Change (pts)", "num"],
    ];
    const draw = (chart) => {
      const wk = win().weekly;
      const i = wk.weeks.length - 1, j = i - 1;
      const ti = tot(wk, i), tj = tot(wk, j);
      const rows = D.codes.filter((c) => c !== "unclear_other").map((code) => {
        const k = wk.by_code[code][i], kp = wk.by_code[code][j];
        return { code, label: L[code], k, kp, share: (k / ti) * 100, sp: (kp / tj) * 100 };
      });
      [...rows].sort((a, b) => b.share - a.share).forEach((r, n) => (r.rank = n + 1));
      [...rows].sort((a, b) => b.sp - a.sp).forEach((r, n) => (r.prev = n + 1));
      rows.forEach((r) => { r.change = r.prev - r.rank; r.delta = r.share - r.sp; });
      rows.sort((a, b) => {
        const x = a[sortKey], y = b[sortKey];
        return (typeof x === "string" ? x.localeCompare(y) : x - y) * sortDir;
      });
      const badge = (c) => c > 0 ? `<span class="rk up" aria-label="Up ${c} place${c > 1 ? "s" : ""}">▲${c}</span>`
        : c < 0 ? `<span class="rk down" aria-label="Down ${-c} place${c < -1 ? "s" : ""}">▼${-c}</span>`
        : `<span class="rk same" aria-label="Same place">–</span>`;
      const head = COLS.map(([k, t, cls]) => {
        const sorted = k === sortKey ? (sortDir > 0 ? "ascending" : "descending") : "none";
        return `<th class="${cls}" aria-sort="${sorted}"><button type="button" class="sort" data-k="${k}">${t}<i class="sort-ind" aria-hidden="true"></i></button></th>`;
      }).join("");
      const body = rows.map((r) => `<tr class="${state.reason === r.code ? "hl" : ""}"><td class="num">${r.rank}</td><td class="num">${badge(r.change)}</td><td class="reason">${r.label}</td>` +
        `<td class="num strong">${r.share.toFixed(1)}%</td><td class="num">${fmt(r.k)}</td><td class="num">${r.sp.toFixed(1)}%</td><td class="num">${sign(r.delta)}</td></tr>`).join("");
      chart.innerHTML = `<div class="table-wrap"><table class="rank-table"><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table></div>`;
      chart.querySelectorAll("button.sort").forEach((b) => b.addEventListener("click", () => {
        const k = b.dataset.k;
        if (k === sortKey) sortDir = -sortDir;
        else { sortKey = k; sortDir = k === "rank" || k === "label" ? 1 : -1; }
        draw(chart);
        chart.querySelector(`button.sort[data-k="${k}"]`).focus();
      }));
      const iso = (d) => d.toISOString().slice(0, 10);
      const range = (a, b) => (a.slice(0, 7) === b.slice(0, 7) ? `${dayFmt(a)}–${Number(b.slice(8))}` : `${dayFmt(a)} – ${dayFmt(b)}`);
      const prevEnd = iso(new Date(new Date(wk.weeks[i] + "T00:00:00Z") - 864e5));
      const days = Math.round((new Date(D.meta.last_review + "T00:00:00Z") - new Date(wk.weeks[i] + "T00:00:00Z")) / 864e5) + 1;
      el.querySelector(".foot").textContent = `This week = ${range(wk.weeks[i], D.meta.last_review)} (${days} days, ${fmt(ti)} negative reviews); ` +
        `last week = ${range(wk.weeks[j], prevEnd)} (${fmt(tj)}). Shares are of all negative reviews that week, every playtime and language. “Unclear / other” is not ranked.`;
      if (state.reason === "unclear_other") return "Unclear / other is not ranked in this table.";
    };
    return [draw, ["bucket", "basis", "lang"]];
  };

  /* ---------- 6. Quit signals: diverging bars of lift around zero (FT "deviation") ---------- */
  const LIFT = (el) => {
    const draw = (chart, w) => {
      const bucket = state.bucket;
      const pts = [...win().signature[bucket]].sort((a, b) => b.lift - a.lift);
      const narrow = w < 520;
      const ext = d3.max(pts, (d) => Math.abs(d.lift)) * 1.25;
      const top = pts.find((d) => !d.small) || pts[0];
      const who = bucket === "all" ? "All players" : BL(bucket);
      el.querySelector(".sub").innerHTML = `<b>${who}: ${esc(top.label)} quits most</b> — ${top.rate.toFixed(0)}% stopped vs ${top.expected.toFixed(0)}% expected.`;
      const svg = Plot.plot({
        width: w, height: pts.length * 30 + 64, marginLeft: narrow ? 118 : 160, marginRight: 16, marginTop: 48, marginBottom: 10,
        style: { fontFamily: MONO, fontSize: narrow ? "11px" : "12px", color: INK3 },
        x: { domain: [-ext, ext], axis: "top", label: narrow ? "← quits less · quits more →" : "← quits less than similar players · quits more →", labelAnchor: "center", tickFormat: (d) => (d > 0 ? "+" : "") + d, grid: true },
        y: { domain: pts.map((d) => d.label), label: null, tickSize: 0 },
        marks: [
          Plot.barX(pts, { x: "lift", y: "label", fill: (d) => (d.lift > 0 ? ORANGE : BLUE), fillOpacity: (d) => (!lit(d.code) ? 0.15 : d.small ? 0.35 : 1), inset: 3,
            ariaLabel: (d) => `${d.label}: ${sign(d.lift)} points, stop rate ${d.rate}% vs ${d.expected}% expected, ${fmt(d.n)} reviewers`,
            title: (d) => `${d.label}\nStop rate ${d.rate}% vs ${d.expected}% expected\n${sign(d.lift)} pts · ${fmt(d.n)} reviewers${d.small ? " (under 100)" : ""}`, tip: TIP }),
          Plot.ruleX([0], { stroke: INK2 }),
          Plot.text(pts.filter((d) => d.lift >= 0), { x: "lift", y: "label", text: (d) => sign(d.lift), dx: 6, textAnchor: "start", fill: (d) => (!lit(d.code) ? INK3 : INK), fontWeight: 500 }),
          Plot.text(pts.filter((d) => d.lift < 0), { x: "lift", y: "label", text: (d) => sign(d.lift), dx: -6, textAnchor: "end", fill: (d) => (!lit(d.code) ? INK3 : INK), fontWeight: 500 }),
        ],
      });
      chart.append(svg);
      chart.querySelectorAll('g[aria-label="y-axis tick label"] text').forEach((t) => { t.style.fontFamily = SANS; t.style.fill = INK2; });
      if (state.reason && !pts.some((d) => d.code === state.reason)) return `${L[state.reason]} is not shown here.`;
    };
    return [draw, ["basis", "lang"]];
  };

  /* ---------- 7. Stop rate by hours played ---------- */
  const STOPRATE = (el) => {
    const draw = (chart, w) => {
      const st = win().stop;
      const rows = B.map((b) => ({ b: BL(b), key: b, v: (st[b].stopped / st[b].n) * 100, n: st[b].n, k: st[b].stopped }));
      const svg = Plot.plot({
        width: w, height: 240, marginLeft: 40, marginTop: 24, marginBottom: 30,
        style: { fontFamily: MONO, fontSize: "12px", color: INK3 },
        x: { domain: rows.map((d) => d.b), label: null, tickSize: 0, padding: 0.3 },
        y: { domain: [0, 100], axis: null },
        marks: [
          Plot.barY(rows, { x: "b", y: "v", fill: (d) => (state.bucket === "all" || state.bucket === d.key ? ACCENT : "#3A4651"),
            ariaLabel: (d) => `${d.b}: ${d.v.toFixed(1)}% stopped, ${fmt(d.k)} of ${fmt(d.n)}`, title: (d) => `${d.b}: ${fmt(d.k)} of ${fmt(d.n)} stopped (${d.v.toFixed(1)}%)`, tip: TIP }),
          Plot.text(rows, { x: "b", y: "v", text: (d) => `${Math.round(d.v)}%`, dy: -9, fill: INK, fontWeight: 500 }),
          Plot.ruleY([0], { stroke: RULE }),
        ],
      });
      chart.append(svg);
    };
    return [draw, ["basis", "lang"]];
  };

  const KINDS = { signature: SIG, explorer: EXPLORER, quitsignal: QS, timeline: TIMELINE, rank: RANKT, lift: LIFT, stoprate: STOPRATE };
  blocks.forEach((el) => {
    const kind = KINDS[el.dataset.chart];
    if (!kind) return;
    const [draw, ignores] = kind(el);
    setup(el, draw, ignores);
  });
})();
