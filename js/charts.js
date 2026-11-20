/* whyplayersquit charts. Reads the report snapshot named in <body data-json> (aggregates from scripts/export_site_data.py).
   Every number shown is read from that file; nothing is typed in by hand except event dates/quotes. */
(async function () {
  const blocks = document.querySelectorAll("[data-chart]");
  if (!blocks.length) return;
  const root = document.body.dataset.root || "./";
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
  const state = { win: "all" };
  // Event-window label, e.g. "Oct 22–24", from the snapshot (analyze.py EVENT).
  const dayFmt = (s) => d3.utcFormat("%b %-d")(new Date(s + "T00:00:00Z"));
  // Games without a review-spike window (event_window null) get no exclude toggle.
  const EV = D.meta.event_window && (({ first, last }) => first.slice(0, 7) === last.slice(0, 7) ? `${dayFmt(first)}–${last.slice(8).replace(/^0/, "")}` : `${dayFmt(first)} – ${dayFmt(last)}`)(D.meta.event_window);
  const renderers = [];
  const win = () => D.windows[state.win];
  const sign = (v) => (v > 0 ? "+" : v < 0 ? "−" : "") + Math.abs(v).toFixed(1);

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
    if (!EV) return document.createTextNode("");
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
  function eventNote(el) {
    const n = el.querySelector(".event-note");
    if (n) n.textContent = state.win === "noevent"
      ? `Showing ${fmt(D.windows.noevent.n)} reviews: the ${fmt(D.meta.event_reviews)} written ${EV} are left out.` : "";
  }
  function renderAll() { renderers.forEach((r) => r()); }

  // Make data marks reachable by keyboard; their aria-label carries the value.
  function focusable(svg) {
    svg.querySelectorAll("circle[aria-label], rect[aria-label], path[aria-label]").forEach((m) => { m.setAttribute("tabindex", "0"); m.setAttribute("role", "img"); });
  }

  function setup(el, build) {
    const chart = el.querySelector(".chart");
    let lastW = 0, timer;
    const render = () => { lastW = chart.clientWidth; chart.replaceChildren(); build(chart, chart.clientWidth); chart.querySelectorAll("svg").forEach(focusable); eventNote(el); };
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

  /* ---------- 1. Loud vs decisive (home) ---------- */
  const SIG = (el) => {
    let bucket = "all";
    const ctr = el.querySelector(".controls");
    ctr.append(seg([["all", "All players"], ...B.map((b) => [b, BL(b)])], bucket, (v) => { bucket = v; renderAll(); }, "Playtime group"), eventToggle());
    return (chart, w) => {
      const pts = win().signature[bucket];
      const maxShare = d3.max(pts, (d) => d.share), maxN = d3.max(pts, (d) => d.n);
      const rMax = w < 520 ? 22 : 30;
      const rpx = (n) => rMax * Math.sqrt(n / maxN);
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
        r: { domain: [0, maxN], range: [0, rMax] },
        marks: [
          Plot.ruleY([0], { stroke: INK2, strokeWidth: 1 }),
          Plot.text(["More likely to stop than their group ↑"], { frameAnchor: "top-right", dy: 2, fill: ACCENT, fontWeight: 500 }),
          Plot.text(["↓ Less likely to stop"], { frameAnchor: "bottom-right", dy: -4, fill: INK2, fontWeight: 500 }),
          Plot.dot(lab, {
            x: "share", y: "lift", r: "n", ariaLabel: (d) => `${d.label}: main reason in ${d.share}% of negative reviews, stop rate ${d.rate}%, lift ${sign(d.lift)} points, ${fmt(d.n)} reviewers`,
            fill: (d) => (d.lift > 0 ? ACCENT : GRAY), fillOpacity: (d) => (d.small ? 0.3 : 0.9),
            stroke: PANEL, strokeWidth: 1.5,
            title: (d) => `${d.label}\nMain reason in ${d.share}% of negative reviews (${fmt(d.primary_n)} of ${fmt(d.bucket_n)})\n` +
              `Stop rate ${d.rate}% vs ${d.expected}% for ${groupWord}\nLift ${sign(d.lift)} pts · ${fmt(d.n)} judged reviewers${d.small ? " (fewer than 100: faded)" : ""}`,
            tip: TIP, sort: { channel: "-r" },
          }),
          Plot.text(lab, {
            x: "share", y: "lift", text, textAnchor: "start",
            fill: INK, fillOpacity: (d) => (d.small ? 0.6 : 1), fontFamily: SANS, fontWeight: 500, className: "sig-labels",
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
    };
  };

  const seqColor = d3.scaleLinear().domain([0, 0.25, 0.5, 0.75, 1]).range(SEQ).interpolate(d3.interpolateRgb);

  /* ---------- 2. Reason explorer (heatmap) ---------- */
  const EXPLORER = (el) => {
    let metric = "primary", lang = "all";
    const ctr = el.querySelector(".controls");
    const sel = document.createElement("select");
    sel.setAttribute("aria-label", "Review language");
    const opts = [["all", `All ${D.meta.languages} languages`], ...D.top_langs.map((l) => [l, LANG[l] || l])];
    sel.innerHTML = opts.map(([v, t]) => `<option value="${v}">${t}</option>`).join("");
    sel.addEventListener("change", () => { lang = sel.value; renderAll(); });
    ctr.append(seg([["primary", "Main reason"], ["mentions", "Any mention"]], metric, (v) => { metric = v; renderAll(); }, "Count"), sel, eventToggle());
    return (chart, w) => {
      const c = win().counts[lang];
      const cells = [];
      D.codes.forEach((code) => B.forEach((b) => {
        const n = c.n[b], k = c[metric][b][code];
        cells.push({ reason: L[code], bucket: b, k, n, v: n ? (k / n) * 100 : 0, small: n < 100 });
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
          Plot.cell(cells, { x: "bucket", y: "reason", fill: "v", ariaLabel: (d) => `${d.reason}, ${BL(d.bucket)}: ${d.v.toFixed(1)}% (${fmt(d.k)} of ${fmt(d.n)})`, fillOpacity: (d) => (d.small ? 0.35 : 1), inset: 1, rx: 3,
            title: (d) => `${d.reason} · ${BL(d.bucket)}\n${fmt(d.k)} of ${fmt(d.n)} reviews (${d.v.toFixed(1)}%)${d.small ? "\nFewer than 100 reviews in this group" : ""}`, tip: TIP }),
          Plot.text(cells, { x: "bucket", y: "reason", text: (d) => d.v.toFixed(0) + "%", fill: (d) => (d.small ? INK2 : textOn(seqColor(d.v / max))), pointerEvents: "none" }),
        ],
      });
      chart.append(svg);
      const foot = el.querySelector(".foot");
      foot.textContent = `${fmt(nTot)} reviews in this view. Columns = playtime at review. ` +
        (metric === "mentions" ? "Any mention = main or secondary reason, so columns add to more than 100%. " : "Each column adds to 100%. ") +
        (cells.some((d) => d.small) ? "Faded columns have fewer than 100 reviews." : "");
    };
  };

  /* ---------- 3. Quit-signal table ---------- */
  const ORDER = ["ping_cap_region_access", "progression_wipe", "developer_trust_enforcement", "gameplay_design", "grind_gear_gap",
    "cheaters", "balance", "technical_client", "servers_access", "social_teammates", "price_value", "unclear_other"];
  const QS = (el) => {
    let basis = "primary";
    el.querySelector(".controls").append(seg([["primary", "Main reason"], ["mentions", "Any mention"]], basis, (v) => { basis = v; renderAll(); }, "Reason basis"), eventToggle());
    return (chart) => {
      const st = win().stop;
      const base = Object.fromEntries(B.map((b) => [b, st[b].stopped / st[b].n * 100]));
      let h = `<div class="table-wrap"><table class="qs-table"><thead><tr><th>${basis === "primary" ? "Main reason" : "Reason mentioned"}</th>${B.map((b) => `<th>${BL(b)}</th>`).join("")}</tr></thead><tbody>`;
      h += `<tr class="base"><td>All reviewers in group</td>${B.map((b) => `<td class="cell" tabindex="0">${Math.round(base[b])}%<span class="tip">All ${BL(b)} reviewers: ${fmt(st[b].stopped)} of ${fmt(st[b].n)} stopped (${base[b].toFixed(1)}%). This is the group average.</span></td>`).join("")}</tr>`;
      // Known codes in the fixed order; a game-specific codebook's extra codes go after them.
      [...ORDER.filter((c) => D.codes.includes(c)), ...D.codes.filter((c) => !ORDER.includes(c))].forEach((code) => {
        h += `<tr><td>${L[code]}</td>`;
        B.forEach((b) => {
          const x = st[b][basis][code];
          if (!x.n) { h += `<td>–</td>`; return; }
          const r = x.stopped / x.n * 100, diff = r - base[b], small = x.n < 100;
          const a = Math.min(1, Math.abs(diff) / 30);
          // Solid blend over the panel so the label color can be chosen for contrast (>= 4.5:1).
          const bg = small ? "" : diff >= 0 ? mix(ORANGE, PANEL, 0.15 + a * 0.6) : mix(BLUE, PANEL, 0.12 + a * 0.6);   // warm = stops more (matches home); caps keep light text >= 4.6:1
          const fg = small ? "" : textOn(bg);
          h += `<td class="cell${small ? " small-n" : ""}" tabindex="0" style="background:${bg};${fg ? "color:" + fg : ""}">${Math.round(r)}%${small ? "*" : ""}` +
            `<span class="tip"><b>${L[code]} · ${BL(b)}</b><br>${fmt(x.stopped)} of ${fmt(x.n)} stopped (${r.toFixed(1)}%)<br>Group average ${base[b].toFixed(1)}% → ${sign(diff)} pts${small ? "<br>Fewer than 100 reviewers: read with care" : ""}</span></td>`;
        });
        h += `</tr>`;
      });
      h += `</tbody></table></div>`;
      chart.innerHTML = h;
    };
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
    return (chart, w) => {
      const wk = win().weekly;
      const narrow = w < 560;
      const label = (s) => d3.utcFormat("%b %d")(new Date(s + "T00:00:00Z"));
      const weeks = wk.weeks.map(label);
      const rows = [];
      wk.weeks.forEach((_, i) => groups.forEach((g) => rows.push({ week: weeks[i], g: name(g), k: wk.series[g][i], i })));
      const totals = weeks.map((x, i) => ({ week: x, t: tot(wk, i) }));
      const maxT = d3.max(totals, (d) => d.t);
      const markers = EVENTS.map((e, i) => ({ week: weeks[e.week], n: i + 1 }));
      const svg = Plot.plot({
        width: w, height: narrow ? 360 : 420, marginLeft: narrow ? 40 : 50, marginTop: 34, marginBottom: narrow ? 46 : 34,
        style: { fontFamily: MONO, fontSize: narrow ? "10.5px" : "12px", color: INK3 },
        x: { domain: weeks, label: null, tickSize: 0, padding: 0.18, tickRotate: narrow ? -45 : 0 },
        y: { label: "↑ Negative reviews per week", grid: true, domain: [0, maxT * 1.2], tickFormat: narrow ? d3.format("~s") : d3.format(",") },
        color: { domain: groups.map(name), range: colors },
        marks: [
          Plot.barY(rows, { x: "week", y: "k", fill: "g", order: groups.map(name), ariaLabel: (d) => `Week of ${d.week}, ${d.g}: ${fmt(d.k)}`, title: (d) => `Week of ${d.week}${d.i === weeks.length - 1 ? " (8 days)" : ""}\n${d.g}: ${fmt(d.k)} (${pct(d.k, tot(wk, d.i))})`, tip: TIP }),
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
    };
  };

  const KINDS = { signature: SIG, explorer: EXPLORER, quitsignal: QS, timeline: TIMELINE };
  blocks.forEach((el) => {
    const kind = KINDS[el.dataset.chart];
    if (!kind) return;
    const draw = kind(el);
    setup(el, draw);
  });
})();
