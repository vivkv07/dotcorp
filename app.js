/* Ontology Studio — interactive Foundry-style ontology diagram
   Layout: three tiers on a 1500×940 stage.
     top    : Analytics & Workflows / Automations / Products & SDKs
     middle : the Ontology slab — object discs, verb pills, automations, property card
     bottom : Data Sources / Logic Sources / Systems of Action                          */

(() => {
  "use strict";

  /* ---------------------------------------------------------------- geometry */
  // Two geometries: landscape (the three tiers side by side, objects flowing
  // left to right) and portrait for phones (tiers stacked, objects flowing top
  // to bottom). SLAB is the ontology's top face, a trapezoid in perspective;
  // PLANE is the part of it objects may occupy.
  const LANDSCAPE = {
    VB: { w: 1500, h: 1000 },
    SLAB: { tl: [280, 390], tr: [1220, 390], br: [1330, 690], bl: [170, 690], depth: 20 },
    PLANE: { u0: 0.13, u1: 0.95, v0: 0.18, v1: 0.86 },
  };
  const PORTRAIT = {
    VB: { w: 460, h: 1330 },
    SLAB: { tl: [44, 205], tr: [416, 205], br: [452, 1005], bl: [8, 1005], depth: 14 },
    PLANE: { u0: 0.16, u1: 0.84, v0: 0.09, v1: 0.9 },
  };
  let VB = LANDSCAPE.VB, SLAB = LANDSCAPE.SLAB, PLANE = LANDSCAPE.PLANE, portrait = false;
  const portraitQuery = matchMedia("(max-width: 700px)");
  function setMode() {
    portrait = portraitQuery.matches;
    const g = portrait ? PORTRAIT : LANDSCAPE;
    VB = g.VB; SLAB = g.SLAB; PLANE = g.PLANE;
    document.getElementById("stage").setAttribute("viewBox", `0 0 ${VB.w} ${VB.h}`);
  }
  const TOP_X = [330, 750, 1170];
  const BOTTOM_X = [330, 750, 1170];
  const TOP_LABELS = ["Analytics & Workflows", "Automations", "Products & SDKs"];
  const BOTTOM_LABELS = ["Data Sources", "Logic Sources", "Systems of Action"];
  const TIER_KEYS = ["data", "logic", "action"];
  const TIER_CLASS = ["tile-data", "tile-logic", "tile-action"];
  const STATUSES = ["ok", "warn", "bad", "info", "neutral"];

  const lerp = (a, b, t) => a + (b - a) * t;
  function project(u, v) {
    const xl = lerp(SLAB.tl[0], SLAB.bl[0], v);
    const xr = lerp(SLAB.tr[0], SLAB.br[0], v);
    return [lerp(xl, xr, u), lerp(SLAB.tl[1], SLAB.bl[1], v)];
  }
  function unproject(x, y) {
    const v = (y - SLAB.tl[1]) / (SLAB.bl[1] - SLAB.tl[1]);
    const xl = lerp(SLAB.tl[0], SLAB.bl[0], v);
    const xr = lerp(SLAB.tr[0], SLAB.br[0], v);
    return [(x - xl) / (xr - xl), v];
  }
  const clamp = (n, a, b) => Math.max(a, Math.min(b, n));

  /* ------------------------------------------------------------------- state */
  const $ = (sel, el = document) => el.querySelector(sel);
  const $$ = (sel, el = document) => Array.from(el.querySelectorAll(sel));
  const deep = (o) => JSON.parse(JSON.stringify(o));
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

  let state = null;         // { company, industry, objects, links, sources, positions, selected }
  let hover = null;         // hovered object id
  let dragging = null;      // { id, moved }
  const svg = $("#stage");
  const measureCtx = document.createElement("canvas").getContext("2d");

  function fromTemplate(key, company) {
    const t = INDUSTRIES[key] || INDUSTRIES.manufacturing;
    return {
      company: company || "",
      industry: key,
      objects: deep(t.objects),
      links: deep(t.links),
      sources: deep(t.sources),
      positions: {},
      selected: t.objects[0].id,
    };
  }

  /* ----------------------------------------------------------- persistence */
  const b64u = {
    enc: (bytes) => btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, ""),
    dec: (s) => Uint8Array.from(atob(s.replace(/-/g, "+").replace(/_/g, "/")), (c) => c.charCodeAt(0)),
  };
  async function encodeState() {
    const json = JSON.stringify(state);
    const bytes = new TextEncoder().encode(json);
    if (typeof CompressionStream !== "undefined") {
      const cs = new CompressionStream("gzip");
      const w = cs.writable.getWriter();
      w.write(bytes); w.close();
      const out = new Uint8Array(await new Response(cs.readable).arrayBuffer());
      return "g." + b64u.enc(out);
    }
    return "j." + b64u.enc(bytes);
  }
  async function decodeState(s) {
    const [kind, payload] = [s.slice(0, 2), s.slice(2)];
    const bytes = b64u.dec(payload);
    let json;
    if (kind === "g.") {
      const ds = new DecompressionStream("gzip");
      const w = ds.writable.getWriter();
      w.write(bytes); w.close();
      json = await new Response(ds.readable).text();
    } else json = new TextDecoder().decode(bytes);
    return JSON.parse(json);
  }
  function validState(s) {
    return s && Array.isArray(s.objects) && Array.isArray(s.links) && s.sources && INDUSTRIES[s.industry];
  }
  function save() {
    try { localStorage.setItem("ontology-studio", JSON.stringify(state)); } catch (_) { /* private mode */ }
  }
  async function loadInitial() {
    const m = location.hash.match(/#s=([^&]+)/);
    if (m) {
      try { const s = await decodeState(m[1]); if (validState(s)) return s; } catch (_) { /* fall through */ }
    }
    try {
      const s = JSON.parse(localStorage.getItem("ontology-studio"));
      if (validState(s)) return s;
    } catch (_) { /* ignore */ }
    return fromTemplate("manufacturing", "");
  }

  /* --------------------------------------------------------------- layout */
  // Layered ("left to right") layout: rank objects along their links, break cycles,
  // then spread each rank's members vertically. Dragged objects keep their spot.
  function computeLayout() {
    const ids = state.objects.map((o) => o.id);
    const idx = new Map(ids.map((id, i) => [id, i]));
    const links = state.links.filter((l) => idx.has(l.source) && idx.has(l.target) && l.source !== l.target);
    const indeg = new Map(ids.map((id) => [id, 0]));
    const out = new Map(ids.map((id) => [id, []]));
    links.forEach((l) => { indeg.set(l.target, indeg.get(l.target) + 1); out.get(l.source).push(l.target); });

    const remaining = new Set(ids);
    const order = [];
    while (remaining.size) {
      let pick = ids.find((id) => remaining.has(id) && indeg.get(id) === 0);
      if (!pick) pick = [...remaining].sort((a, b) => indeg.get(a) - indeg.get(b))[0]; // cycle: cut lowest in-degree
      remaining.delete(pick);
      order.push(pick);
      out.get(pick).forEach((t) => { if (remaining.has(t)) indeg.set(t, indeg.get(t) - 1); });
    }
    const pos = new Map(order.map((id, i) => [id, i]));
    const rank = new Map();
    const preds = new Map(ids.map((id) => [id, []]));
    links.forEach((l) => { if (pos.get(l.source) < pos.get(l.target)) preds.get(l.target).push(l.source); });
    order.forEach((id) => rank.set(id, preds.get(id).reduce((m, p) => Math.max(m, rank.get(p) + 1), 0)));
    // Pull objects with no predecessors as far right as their successors allow, so that
    // "source" objects spread across columns instead of piling up in the first one.
    const succs = new Map(ids.map((id) => [id, []]));
    links.forEach((l) => { if (pos.get(l.source) < pos.get(l.target)) succs.get(l.source).push(l.target); });
    [...order].reverse().forEach((id) => {
      if (preds.get(id).length || !succs.get(id).length) return;
      rank.set(id, Math.max(0, Math.min(...succs.get(id).map((t) => rank.get(t))) - 1));
    });

    const maxRank = Math.max(0, ...rank.values());
    const cols = Array.from({ length: maxRank + 1 }, () => []);
    order.forEach((id) => cols[rank.get(id)].push(id));
    const row = new Map();
    cols.forEach((col, c) => {
      if (c > 0) {
        const bary = (id) => { const p = preds.get(id); return p.length ? p.reduce((s, q) => s + row.get(q), 0) / p.length : 0.5; };
        col.sort((a, b) => bary(a) - bary(b));
      }
      col.forEach((id, i) => row.set(id, col.length === 1 ? 0.5 : i / (col.length - 1)));
    });

    // Ranks run along axis A (u in landscape, v in portrait); members of a rank
    // spread along axis B. The spread gets a small alternating shift per rank so
    // neighbouring ranks' labels do not line up.
    const [A0, A1, B0, B1] = portrait ? [PLANE.v0, PLANE.v1, PLANE.u0, PLANE.u1] : [PLANE.u0, PLANE.u1, PLANE.v0, PLANE.v1];
    const layout = {};
    cols.forEach((col, c) => {
      const a = lerp(A0, A1, cols.length === 1 ? 0.5 : c / (cols.length - 1));
      const pitch = cols.length > 1 ? (A1 - A0) / (cols.length - 1) : 0.3;
      col.forEach((id, i) => {
        const shift = (c % 2 ? 0.05 : -0.05) * (portrait ? 1.6 : 1);
        let b, aa = a;
        if (col.length === 1) b = 0.5 + shift * (portrait ? 2.5 : 4);
        else if (col.length === 2) b = lerp(B0 + 0.1, B1 - 0.1, i) + shift;
        else if (col.length === 3) b = lerp(B0, B1, i / 2) + (i === 1 ? shift : 0);
        else { // crowded rank: zig-zag along the rank axis so discs and labels stay readable
          b = lerp(B0 - 0.02, B1 + 0.04, i / (col.length - 1));
          aa = a + (i % 2 ? 0.3 : -0.3) * pitch;
        }
        const A = clamp(aa, A0 - 0.05, A1 + 0.03), B = clamp(b, B0 - 0.04, B1 + 0.04);
        layout[id] = portrait ? { u: B, v: A } : { u: A, v: B };
      });
    });
    state.objects.forEach((o) => {
      const p = state.positions[o.id] || layout[o.id] || { u: 0.5, v: 0.5 };
      o._u = p.u; o._v = p.v;
      [o._x, o._y] = project(p.u, p.v);
    });
  }

  /* ------------------------------------------------------------- rendering */
  function textW(text, size, weight = "400") {
    measureCtx.font = `${weight} ${size}px "Space Mono", "SFMono-Regular", Menlo, monospace`;
    return measureCtx.measureText(text).width;
  }
  const HEAVY = /pill-object|pill-action|pill-auto|pill-outline/;
  function pill(x, y, text, cls, size = 11, padX = 9, h = 20, anchor = "middle", extra = "") {
    const w = textW(text, size, /pill-object/.test(cls) ? "700" : "400") + padX * 2;
    const x0 = anchor === "middle" ? x - w / 2 : anchor === "start" ? x : x - w;
    return `<g class="pill ${cls}" ${extra}><rect x="${x0.toFixed(1)}" y="${(y - h / 2).toFixed(1)}" width="${w.toFixed(1)}" height="${h}" rx="${h / 2}"/><text x="${(x0 + w / 2).toFixed(1)}" y="${(y + size * 0.36).toFixed(1)}" font-size="${size}">${esc(text)}</text></g>`;
  }
  const icon = (name, x, y, size = 26, cls = "icon") => {
    const body = ICONS[name] || ICONS.box;
    return `<g class="${cls}" transform="translate(${(x - size / 2).toFixed(1)} ${(y - size / 2).toFixed(1)}) scale(${(size / 24).toFixed(3)})">${body}</g>`;
  };

  function slab(cx, topY, topW, botY, botW, depth, cls = "") {
    const p = [[cx - topW / 2, topY], [cx + topW / 2, topY], [cx + botW / 2, botY], [cx - botW / 2, botY]];
    const face = p.map((q) => q.join(",")).join(" ");
    return `<g class="slab ${cls}">
      <polygon class="slab-front" points="${p[3][0]},${botY} ${p[2][0]},${botY} ${p[2][0]},${botY + depth} ${p[3][0]},${botY + depth}"/>
      <polygon class="slab-top" points="${face}"/>
    </g>`;
  }

  function wires(startPts, endPts) {
    return startPts.map((s, i) => {
      const e = endPts[i];
      const dy = (e[1] - s[1]) * 0.55;
      const d = `M${s[0]},${s[1]} C${s[0]},${s[1] + dy} ${e[0]},${e[1] - dy} ${e[0]},${e[1]}`;
      return `<path class="wire" d="${d}"/><path class="wire-dots" d="${d}"/>`;
    }).join("");
  }

  function monitor(x, y, w, h, kind) {
    // A line-art screen with a small scene inside: a chart, a map, a list, a
    // board, a tree, a form or a code editor. Drawn in the page's pastel
    // palette so the platforms read as products rather than wireframes.
    const ix = x + 7, iy = y + 13, iw = w - 14, ih = h - 20;
    const X = (t) => (ix + t * iw).toFixed(1), Y = (t) => (iy + t * ih).toFixed(1);
    let inner = "";
    if (kind === "line") {
      const pts = [0, .15, .3, .45, .6, .75, .9, 1].map((t, i) => [ix + t * iw, iy + ih * (0.82 - 0.55 * Math.abs(Math.sin(i * 1.3 + 0.4)))]);
      const path = pts.map((p, i) => `${i ? "L" : "M"}${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(" ");
      inner = [.25, .5, .75].map((t) => `<line class="mini-gridline" x1="${ix}" y1="${Y(t)}" x2="${ix + iw}" y2="${Y(t)}"/>`).join("") +
        `<path class="mini-area" d="${path} L${X(1)},${Y(1)} L${X(0)},${Y(1)} Z"/><path class="mini-line" d="${path}"/>` +
        `<line class="mini-axis" x1="${ix}" y1="${Y(1)}" x2="${ix + iw}" y2="${Y(1)}"/>` +
        pts.filter((_, i) => i % 2).map((p) => `<circle class="mini-dot" cx="${p[0].toFixed(1)}" cy="${p[1].toFixed(1)}" r="2"/>`).join("");
    } else if (kind === "bars") {
      inner = [.35, .6, .45, .85, .55, .95, .7].map((v, i) => `<rect class="mini-bar${i % 2 ? " alt" : ""}" x="${(ix + i * iw / 7 + 2).toFixed(1)}" y="${(iy + ih * (1 - v)).toFixed(1)}" width="${(iw / 7 - 4).toFixed(1)}" height="${(ih * v).toFixed(1)}" rx="1"/>`).join("") +
        `<line class="mini-axis" x1="${ix}" y1="${Y(1)}" x2="${ix + iw}" y2="${Y(1)}"/>`;
    } else if (kind === "map") {
      inner = `<rect class="mini-block" x="${X(.08)}" y="${Y(.12)}" width="${(iw * .22).toFixed(1)}" height="${(ih * .22).toFixed(1)}"/><rect class="mini-block" x="${X(.7)}" y="${Y(.6)}" width="${(iw * .2).toFixed(1)}" height="${(ih * .28).toFixed(1)}"/><rect class="mini-block" x="${X(.12)}" y="${Y(.66)}" width="${(iw * .16).toFixed(1)}" height="${(ih * .2).toFixed(1)}"/>` +
        `<path class="mini-map" d="M${X(0)},${Y(.5)} H${X(1)} M${X(.5)},${Y(0)} V${Y(1)}"/>` +
        `<path class="mini-route" d="M${X(.1)},${Y(.85)} Q${X(.3)},${Y(.35)} ${X(.55)},${Y(.5)} T${X(.9)},${Y(.2)}"/>` +
        [[.1, .85], [.55, .5], [.9, .2]].map(([a, b]) => `<circle class="mini-pin" cx="${X(a)}" cy="${Y(b)}" r="4"/><circle class="mini-pin-core" cx="${X(a)}" cy="${Y(b)}" r="1.5"/>`).join("");
    } else if (kind === "list") {
      inner = [0, 1, 2, 3, 4].map((i) => { const ry = iy + i * ih / 5 + 2, rh = ih / 5 - 5, cy = ry + rh / 2; return `<rect class="mini-row" x="${ix}" y="${ry.toFixed(1)}" width="${iw}" height="${rh.toFixed(1)}" rx="2"/><rect class="mini-box${i < 3 ? " on" : ""}" x="${ix + 4}" y="${(cy - 3).toFixed(1)}" width="6" height="6" rx="1"/><line class="mini-text-line dark" x1="${ix + 15}" y1="${cy.toFixed(1)}" x2="${(ix + 15 + iw * (0.35 + (i % 3) * 0.12)).toFixed(1)}" y2="${cy.toFixed(1)}"/>`; }).join("");
    } else if (kind === "kanban") {
      inner = [0, 1, 2].map((c) => { const cx0 = ix + c * iw / 3 + 1, cw = iw / 3 - 2; return `<rect class="mini-col" x="${cx0.toFixed(1)}" y="${iy}" width="${cw.toFixed(1)}" height="${ih}" rx="2"/><rect class="mini-colhead" x="${cx0.toFixed(1)}" y="${iy}" width="${cw.toFixed(1)}" height="5" rx="2"/>` +
        [0, 1, 2].slice(0, 3 - (c % 2)).map((r) => { const cy0 = iy + 8 + r * (ih - 8) / 3; const ch = (ih - 8) / 3 - 3; return `<rect class="mini-card" x="${(cx0 + 2).toFixed(1)}" y="${cy0.toFixed(1)}" width="${(cw - 4).toFixed(1)}" height="${ch.toFixed(1)}" rx="1.5"/><line class="mini-text-line dark" x1="${(cx0 + 5).toFixed(1)}" y1="${(cy0 + 4).toFixed(1)}" x2="${(cx0 + cw - 6).toFixed(1)}" y2="${(cy0 + 4).toFixed(1)}"/><line class="mini-text-line" x1="${(cx0 + 5).toFixed(1)}" y1="${(cy0 + 8).toFixed(1)}" x2="${(cx0 + cw * .6).toFixed(1)}" y2="${(cy0 + 8).toFixed(1)}"/>`; }).join(""); }).join("");
    } else if (kind === "tree") {
      const cx = ix + iw / 2, r1 = iy + 6, r2 = iy + ih / 2, r3 = iy + ih - 7;
      const kids = [.18, .5, .82].map((t) => ix + iw * t);
      inner = `<path class="mini-tree" d="M${cx},${r1 + 4} V${r2} M${kids[0]},${r2} H${kids[2]} ${kids.map((k) => `M${k},${r2} V${r3 - 5}`).join(" ")}"/>` +
        `<rect class="mini-node root" x="${cx - 12}" y="${r1 - 5}" width="24" height="9" rx="2"/>` +
        kids.map((k) => `<rect class="mini-node" x="${k - 10}" y="${r3 - 5}" width="20" height="9" rx="2"/><line class="mini-text-line" x1="${k - 6}" y1="${r3 - .5}" x2="${k + 6}" y2="${r3 - .5}"/>`).join("");
    } else if (kind === "action") {
      inner = [0, 1].map((i) => `<rect class="mini-field" x="${ix}" y="${(iy + i * ih * .27).toFixed(1)}" width="${iw}" height="${(ih * .2).toFixed(1)}" rx="2"/><line class="mini-text-line" x1="${ix + 4}" y1="${(iy + i * ih * .27 + ih * .1).toFixed(1)}" x2="${(ix + iw * (0.45 + i * .2)).toFixed(1)}" y2="${(iy + i * ih * .27 + ih * .1).toFixed(1)}"/>`).join("") +
        `<rect class="mini-action" x="${ix}" y="${Y(.62)}" width="${(iw * .58).toFixed(1)}" height="${(ih * .3).toFixed(1)}" rx="4"/><text class="mini-text" x="${X(.29)}" y="${(iy + ih * .82).toFixed(1)}">ACTION</text>`;
    } else if (kind === "code") {
      const lines = [[.1, .35, "k"], [.18, .6, "v"], [.18, .45, "s"], [.1, .2, "c"], [.18, .7, "v"], [.26, .4, "k"], [.1, .3, "c"]];
      inner = `<rect class="mini-gutter" x="${ix}" y="${iy}" width="6" height="${ih}"/>` +
        lines.map(([a, b, cls], i) => { const ly = iy + 5 + i * (ih - 6) / lines.length; return `<line class="mini-code ${cls}" x1="${(ix + 9 + iw * a).toFixed(1)}" y1="${ly.toFixed(1)}" x2="${(ix + 9 + iw * (a + b)).toFixed(1)}" y2="${ly.toFixed(1)}"/>`; }).join("");
    }
    return `<g class="monitor"><ellipse class="mon-shadow" cx="${x + w / 2}" cy="${y + h + 11}" rx="${(w * .42).toFixed(1)}" ry="3"/>
      <rect class="mon-frame" x="${x}" y="${y}" width="${w}" height="${h}" rx="3"/>
      <rect class="mon-bar" x="${x + .5}" y="${y + .5}" width="${w - 1}" height="9" rx="2.5"/>
      <circle class="mon-btn b1" cx="${x + 6}" cy="${y + 5}" r="1.5"/><circle class="mon-btn b2" cx="${x + 11}" cy="${y + 5}" r="1.5"/><circle class="mon-btn b3" cx="${x + 16}" cy="${y + 5}" r="1.5"/>
      <rect class="mon-screen" x="${x + 4}" y="${y + 11}" width="${w - 8}" height="${h - 15}" rx="2"/>
      ${inner}
      <path class="mon-stand" d="M${x + w / 2 - 12},${y + h + 9} h24 l-3,-3 h-18 Z M${x + w / 2 - 3},${y + h} h6 v6 h-6 Z"/></g>`;
  }

  const P_X = [80, 230, 380]; // portrait: the three platforms and the three tiers
  function topTierPortrait() {
    let out = "";
    const kinds = ["line", "kanban", "code"];
    const starts = [], ends = [];
    P_X.forEach((cx, k) => {
      out += `<text class="tier-label small" x="${cx}" y="22">${esc(TOP_LABELS[k]).toUpperCase()}</text>`;
      out += slab(cx, 122, 116, 152, 132, 8, "tier-slab");
      out += monitor(cx - 40, 44, 80, 58, kinds[k]);
      for (let i = 0; i < 4; i++) {
        ends.push([cx - 36 + i * 24, 160]);
        starts.push([lerp(SLAB.tl[0] + 24, SLAB.tr[0] - 24, (k * 4 + i + 0.5) / 12), SLAB.tl[1]]);
      }
    });
    return out + `<g class="wires">${wires(starts, ends)}</g>`;
  }
  function bottomTierPortrait() {
    let out = "";
    const starts = [], ends = [];
    const top = SLAB.bl[1] + 50;
    P_X.forEach((cx, k) => {
      out += slab(cx, top, 128, top + 224, 144, 10, "tier-slab");
      const tiles = state.sources[TIER_KEYS[k]] || [];
      tiles.slice(0, 6).forEach((t, i) => {
        const x = cx - 58, y = top + 10 + i * 34;
        out += `<g class="tile small ${TIER_CLASS[k]}" data-tier="${TIER_KEYS[k]}" data-i="${i}" style="--i:${k * 6 + i}"><rect x="${x}" y="${y}" width="116" height="28" rx="3"/><text x="${cx}" y="${y + 18}">${esc(t).toUpperCase()}</text></g>`;
      });
      out += `<text class="tier-label small" x="${cx}" y="${top + 258}">${esc(BOTTOM_LABELS[k]).toUpperCase()}</text>`;
      for (let i = 0; i < 4; i++) {
        starts.push([lerp(SLAB.bl[0] + 30, SLAB.br[0] - 30, (k * 4 + i + 0.5) / 12), SLAB.bl[1] + SLAB.depth]);
        ends.push([cx - 36 + i * 24, top]);
      }
    });
    return `<g class="wires">${wires(starts, ends)}</g>` + out;
  }

  function topTier() {
    if (portrait) return topTierPortrait();
    let out = "";
    TOP_X.forEach((cx, k) => {
      out += `<text class="tier-label" x="${cx}" y="102">${esc(TOP_LABELS[k]).toUpperCase()}</text>`;
      out += slab(cx, 250, 300, 300, 350, 12, "tier-slab");
      if (k === 0) out += monitor(cx - 120, 132, 105, 78, "line") + monitor(cx + 10, 148, 110, 80, "map") + monitor(cx - 60, 190, 100, 62, "bars");
      if (k === 1) out += monitor(cx - 115, 150, 95, 75, "list") + monitor(cx - 20, 132, 110, 84, "kanban") + monitor(cx + 45, 178, 70, 60, "line");
      if (k === 2) out += monitor(cx - 120, 140, 100, 75, "action") + monitor(cx + 15, 138, 110, 80, "tree") + monitor(cx - 55, 190, 100, 60, "code");
    });
    // wires: ontology top edge → tier plates
    const starts = [], ends = [];
    TOP_X.forEach((cx, k) => {
      for (let i = 0; i < 7; i++) {
        ends.push([cx - 96 + i * 32, 313]);
        starts.push([lerp(SLAB.tl[0] + 30, SLAB.tr[0] - 30, (k * 7 + i + 0.5) / 21), SLAB.tl[1]]);
      }
    });
    out += `<g class="wires">${wires(starts, ends)}</g>`;
    // SDK / API pills on the rightmost bundle
    out += pill(TOP_X[2] - 60, 352, "SDK", "pill-outline", 9, 7, 16) + pill(TOP_X[2], 352, "SDK", "pill-outline", 9, 7, 16) + pill(TOP_X[2] + 60, 352, "API", "pill-outline", 9, 7, 16);
    return out;
  }

  function bottomTier() {
    if (portrait) return bottomTierPortrait();
    let out = "";
    const starts = [], ends = [];
    BOTTOM_X.forEach((cx, k) => {
      out += slab(cx, 740, 330, 908, 380, 14, "tier-slab");
      const tiles = state.sources[TIER_KEYS[k]] || [];
      tiles.slice(0, 6).forEach((t, i) => {
        const col = i % 2, r = Math.floor(i / 2);
        const x = cx - 150 + col * 152, y = 753 + r * 46;
        out += `<g class="tile ${TIER_CLASS[k]}" data-tier="${TIER_KEYS[k]}" data-i="${i}" style="--i:${k * 6 + i}"><rect x="${x}" y="${y}" width="148" height="38" rx="3"/><text x="${x + 74}" y="${y + 23}">${esc(t).toUpperCase()}</text></g>`;
      });
      out += `<text class="tier-label" x="${cx}" y="962">${esc(BOTTOM_LABELS[k]).toUpperCase()}</text>`;
      for (let i = 0; i < 8; i++) {
        starts.push([lerp(SLAB.bl[0] + 40, SLAB.br[0] - 40, (k * 8 + i + 0.5) / 24), SLAB.bl[1] + SLAB.depth]);
        ends.push([cx - 112 + i * 32, 740]);
      }
    });
    out = `<g class="wires">${wires(starts, ends)}</g>` + out;
    return out;
  }

  function ontologySlab() {
    const S = SLAB;
    const face = [S.tl, S.tr, S.br, S.bl].map((p) => p.join(",")).join(" ");
    return `<g class="slab ontology-slab">
      <polygon class="slab-front" points="${S.bl[0]},${S.bl[1]} ${S.br[0]},${S.br[1]} ${S.br[0]},${S.br[1] + S.depth} ${S.bl[0]},${S.bl[1] + S.depth}"/>
      <polygon class="slab-top" points="${face}"/>
      <g class="grid">${[0.2, 0.4, 0.6, 0.8].map((v) => { const a = project(0, v), b = project(1, v); return `<line x1="${a[0]}" y1="${a[1]}" x2="${b[0]}" y2="${b[1]}"/>`; }).join("")}
      ${[0.2, 0.4, 0.6, 0.8].map((u) => { const a = project(u, 0), b = project(u, 1); return `<line x1="${a[0]}" y1="${a[1]}" x2="${b[0]}" y2="${b[1]}"/>`; }).join("")}</g>
    </g>
    <g class="ontology-tag"><rect x="${S.bl[0] + 10}" y="${S.bl[1] - 4}" width="${textW("ONTOLOGY · " + (state.company || "YOUR COMPANY").toUpperCase(), 11) + 40}" height="22" rx="2"/>
      <circle cx="${S.bl[0] + 22}" cy="${S.bl[1] + 7}" r="4"/><circle cx="${S.bl[0] + 22}" cy="${S.bl[1] + 7}" r="1.5" class="dot"/>
      <text x="${S.bl[0] + 32}" y="${S.bl[1] + 11}">ONTOLOGY · ${esc((state.company || "Your Company").toUpperCase())}</text></g>`;
  }

  // Each automated object puts its purple "Automation" pill on one of its links
  // (outgoing preferred), like the reference; objects without links show it beneath.
  function automationEdges() {
    const byId = new Map(state.objects.map((o) => [o.id, o]));
    const byEdge = new Map();
    const len = (l) => { const a = byId.get(l.source), b = byId.get(l.target); return a && b ? Math.hypot(a._x - b._x, a._y - b._y) : 0; };
    state.objects.filter((o) => o.automation).forEach((o) => {
      const pick = (pred) => state.links.map((l, k) => ({ l, k })).filter(({ l, k }) => pred(l) && l.source !== l.target && !byEdge.has(k) && len(l) >= 170)
        .sort((p, q) => len(q.l) - len(p.l))[0];
      const hit = pick((l) => l.source === o.id) || pick((l) => l.target === o.id);
      if (hit) byEdge.set(hit.k, o.id);
    });
    return byEdge;
  }
  let autoUnderNode = new Set(); // automations that found no room on a link
  let actionSpot = new Map();    // object id -> [dx, dy] of its action pill

  // Action pills ("Notify Customer →") sit above their object unless that would cover a
  // neighbour; then they try below, then either side.
  function computeActionSpots() {
    actionSpot = new Map();
    const blocks = state.objects.map((o) => ({ x: o._x, y: o._y + 9, w: Math.max(84, textW(o.name, 11) + 24), h: 64 }));
    const hits = (x, y, w, h) => blocks.some((b) => Math.abs(b.x - x) < (b.w + w) / 2 + 2 && Math.abs(b.y - y) < (b.h + h) / 2 + 2);
    state.objects.filter((o) => o.automation).forEach((o) => {
      const w = textW(o.automation + " →", 10) + 18, h = 19;
      const cands = portrait ? [[0, -58], [0, 54], [0, -58]] : [[0, -58], [0, 54], [-60, -46], [60, -46], [0, -58]];
      const own = blocks.find((b) => b.x === o._x && b.y === o._y + 9);
      const spot = cands.find(([dx, dy]) => { own.h = 0; const ok = !hits(o._x + dx, o._y + dy, w, h); own.h = 64; return ok; }) || cands[0];
      actionSpot.set(o.id, spot);
      blocks.push({ x: o._x + spot[0], y: o._y + spot[1], w, h });
    });
  }

  function edgesMarkup() {
    const byId = new Map(state.objects.map((o) => [o.id, o]));
    computeActionSpots();
    const byEdge = automationEdges();
    autoUnderNode = new Set(state.objects.filter((o) => o.automation && ![...byEdge.values()].includes(o.id)).map((o) => o.id));
    // Obstacles pills must avoid: object discs + name pills, action pills, pills already placed.
    const obstacles = [];
    state.objects.forEach((o) => {
      obstacles.push({ x: o._x, y: o._y + 9, w: Math.max(84, textW(o.name, 11) + 24), h: 64 });
      if (o.automation) { const [dx, dy] = actionSpot.get(o.id) || [0, -58]; obstacles.push({ x: o._x + dx, y: o._y + dy, w: textW(o.automation + " →", 10) + 20, h: 22 }); }
    });
    const collides = (x, y, w, h) => obstacles.some((b) => Math.abs(b.x - x) < (b.w + w) / 2 + 3 && Math.abs(b.y - y) < (b.h + h) / 2 + 3);
    // Try points along the link, then the same points nudged sideways; null when nothing fits.
    const place = (at, perp, label, size, pad, h, ts, force) => {
      const w = textW(label, size) + pad * 2;
      for (const off of [0, 22, -22, 44, -44]) {
        for (const t of ts) {
          const [x0, y0] = at(t);
          const x = x0 + perp[0] * off, y = y0 + perp[1] * off;
          if (!collides(x, y, w, h)) { obstacles.push({ x, y, w, h }); return [x, y]; }
        }
      }
      if (!force) return null;
      const [x, y] = at(ts[0]); obstacles.push({ x, y, w, h }); return [x, y];
    };
    return state.links.map((l, i) => {
      const a = byId.get(l.source), b = byId.get(l.target);
      if (!a || !b || a === b) return "";
      const at = (t) => [a._x + (b._x - a._x) * t, a._y + (b._y - a._y) * t];
      const ang = Math.atan2(b._y - a._y, b._x - a._x);
      const ex = b._x - Math.cos(ang) * 38, ey = b._y - Math.sin(ang) * 20;
      const L = Math.hypot(b._x - a._x, b._y - a._y) || 1;
      const perp = [-(b._y - a._y) / L, (b._x - a._x) / L];
      const autoId = byEdge.get(i);
      let extra = "";
      if (autoId) {
        const ts = l.source === autoId ? [0.3, 0.22, 0.38, 0.5] : [0.7, 0.78, 0.62, 0.5];
        const spot = place(at, perp, "⚡ Automation", 8.5, 7, 15, ts, false);
        if (spot) extra = pill(spot[0], spot[1], "⚡ Automation", "pill-auto", 8.5, 7, 15);
        else autoUnderNode.add(autoId);
      }
      const verb = l.verb || "relates to";
      const [mx, my] = place(at, perp, verb, 10, 8, 18, [0.5, 0.6, 0.4, 0.68, 0.32, 0.75, 0.25], true);
      const sel = a.id === state.selected || b.id === state.selected ? " sel" : "";
      return `<g class="edge${sel}" data-i="${i}" data-s="${esc(a.id)}" data-t="${esc(b.id)}" style="--i:${i}">
        <line class="edge-line" pathLength="1" x1="${a._x.toFixed(1)}" y1="${a._y.toFixed(1)}" x2="${ex.toFixed(1)}" y2="${ey.toFixed(1)}" marker-end="url(#arrow)"/>
        ${pill(mx, my, verb, "pill-verb", 10, 8, 18)}${extra}
      </g>`;
    }).join("");
  }

  function nodesMarkup() {
    return state.objects.map((o, k) => {
      const sel = o.id === state.selected ? " selected" : "";
      let auto = "";
      if (o.automation) {
        const [dx, dy] = actionSpot.get(o.id) || [0, -58];
        auto = pill(dx, dy, o.automation + " →", "pill-action", 10, 9, 19);
        if (autoUnderNode.has(o.id)) auto += pill(0, dy === 54 ? 74 : 47, "⚡ Automation", "pill-auto", 8.5, 7, 15);
      }
      return `<g class="node${sel}" data-id="${esc(o.id)}" transform="translate(${o._x.toFixed(1)} ${o._y.toFixed(1)})" style="--i:${k}">
        <g class="body">
          <ellipse class="disc-shadow" cx="0" cy="6" rx="38" ry="19"/>
          <ellipse class="disc" cx="0" cy="0" rx="38" ry="19"/>
          <ellipse class="disc-ring" cx="0" cy="0" rx="46" ry="24"/>
          ${icon(o.icon, 0, -20, 30)}
          ${pill(0, 27, o.name, "pill-object", 11, 10, 21)}
          ${auto}
        </g>
        <ellipse class="hit" cx="0" cy="0" rx="46" ry="30"/>
      </g>`;
    }).join("");
  }

  function inspectorHTML() {
    const o = state.objects.find((x) => x.id === state.selected);
    if (!o) return "";
    const linkCount = state.links.filter((l) => l.source === o.id || l.target === o.id).length;
    const rows = o.props || [];
    return `<div class="insp-head"><span class="obj-icon"><svg viewBox="0 0 24 24">${ICONS[o.icon] || ICONS.box}</svg></span>
        <div><h3>${esc(o.name)}</h3><p class="meta">Object type · ${linkCount} link${linkCount === 1 ? "" : "s"} · ${rows.length} propert${rows.length === 1 ? "y" : "ies"}</p></div></div>
      <ul>${rows.map((p, i) => `<li style="--i:${i}"><span>${esc(p.label)}</span><b><i class="dot dot-${esc(p.status || "neutral")}"></i>${esc(p.value)}</b></li>`).join("")}
      ${rows.length ? "" : "<li><span>No properties yet. Add some in Customize.</span></li>"}</ul>
      ${o.automation ? `<p class="insp-auto">⚡ ${esc(o.automation)}</p>` : ""}`;
  }

  function cardMarkup() {
    const o = state.objects.find((x) => x.id === state.selected);
    if (!o || portrait) return "";
    const x = 28, y = 404, w = 244, rowH = 22;
    const rows = o.props || [];
    const linkCount = state.links.filter((l) => l.source === o.id || l.target === o.id).length;
    const h = 64 + rows.length * rowH + (o.automation ? 30 : 0) + 8;
    let out = `<g class="card"><rect class="card-bg" x="${x}" y="${y}" width="${w}" height="${h}" rx="6"/>
      <text class="card-title" x="${x + 16}" y="${y + 26}">${esc(o.name.toUpperCase())} OBJECT</text>
      <text class="card-meta" x="${x + 16}" y="${y + 42}">Object type · ${linkCount} link${linkCount === 1 ? "" : "s"} · ${rows.length} propert${rows.length === 1 ? "y" : "ies"}</text>
      <line class="card-rule" x1="${x + 16}" y1="${y + 52}" x2="${x + w - 16}" y2="${y + 52}"/>`;
    rows.forEach((p, i) => {
      const ry = y + 70 + i * rowH;
      const vw = textW(p.value, 10);
      out += `<g class="row" style="--i:${i}"><text class="card-label" x="${x + 16}" y="${ry}">${esc(p.label)}</text>
        <circle class="dot dot-${esc(p.status || "neutral")}" cx="${(x + w - 16 - vw - 10).toFixed(1)}" cy="${ry - 3.5}" r="3"/>
        <text class="card-value" x="${x + w - 16}" y="${ry}" text-anchor="end">${esc(p.value)}</text></g>`;
    });
    if (!rows.length) out += `<g class="row" style="--i:0"><text class="card-label" x="${x + 16}" y="${y + 70}">No properties yet. Add some in Customize.</text></g>`;
    if (o.automation) {
      const ay = y + 70 + rows.length * rowH + 4;
      out += `<g class="row" style="--i:${rows.length}"><line class="card-rule" x1="${x + 16}" y1="${ay - 12}" x2="${x + w - 16}" y2="${ay - 12}"/>
        <text class="card-auto" x="${x + 16}" y="${ay + 6}">⚡ ${esc(o.automation)}</text></g>`;
    }
    // leader line to the selected node
    const nx = o._x - 40, ny = o._y;
    const sx = x + w, sy = y + Math.min(h / 2, 60);
    out += `<path class="card-leader" pathLength="1" d="M${sx},${sy} C${sx + 40},${sy} ${nx - 40},${ny} ${nx},${ny}"/><circle class="card-leader-dot" cx="${nx}" cy="${ny}" r="2.5"/></g>`;
    return out;
  }

  function render() {
    setMode();
    computeLayout();
    const insp = $("#inspector");
    insp.innerHTML = inspectorHTML();
    insp.classList.toggle("has", !!state.selected);
    svg.innerHTML = `
      <defs>
        <marker id="arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z"/></marker>
        <marker id="arrow-sel" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z"/></marker>
        <filter id="soft" x="-20%" y="-20%" width="140%" height="140%"><feDropShadow dx="0" dy="2" stdDeviation="2" flood-color="#1f2328" flood-opacity=".12"/></filter>
      </defs>
      <g class="tier tier-top">${topTier()}</g>
      <g class="tier tier-bottom">${bottomTier()}</g>
      <g class="tier tier-ontology">${ontologySlab()}
        <g class="edges">${edgesMarkup()}</g>
        <g class="nodes">${nodesMarkup()}</g>
        <g class="cards">${cardMarkup()}</g>
      </g>`;
    applyHover();
    renderChrome();
    save();
  }

  // Cheap partial update while dragging: move one node, redraw edges + card.
  function renderPositions() {
    $(".edges", svg).innerHTML = edgesMarkup();
    $(".nodes", svg).innerHTML = nodesMarkup();
    if (dragging) $(`.node[data-id="${dragging.id}"]`, svg)?.classList.add("dragging");
    $(".cards", svg).innerHTML = cardMarkup();
    applyHover();
  }
  // Re-render when the viewport crosses the phone breakpoint.
  portraitQuery.addEventListener("change", () => { if (state && portraitQuery.matches !== portrait) renderFresh(); });

  function applyHover() {
    const id = hover;
    const nodes = $$(".node", svg), edges = $$(".edge", svg);
    if (!id) { nodes.forEach((n) => n.classList.remove("dim", "lit")); edges.forEach((e) => e.classList.remove("dim", "lit")); return; }
    const near = new Set([id]);
    edges.forEach((e) => {
      const on = e.dataset.s === id || e.dataset.t === id;
      e.classList.toggle("lit", on); e.classList.toggle("dim", !on);
      if (on) { near.add(e.dataset.s); near.add(e.dataset.t); }
    });
    nodes.forEach((n) => { const on = near.has(n.dataset.id); n.classList.toggle("lit", on); n.classList.toggle("dim", !on); });
  }

  function renderChrome() {
    const ind = INDUSTRIES[state.industry];
    $("#industry-name").textContent = ind.name;
    $("#industry-icon").innerHTML = `<svg viewBox="0 0 24 24">${ICONS[ind.icon]}</svg>`;
    const cin = $("#company");
    if (cin.value !== state.company) cin.value = state.company;
    const em = $("#hero-company");
    em.textContent = state.company ? `${state.company}'s` : "your company's";
    em.classList.toggle("set", !!state.company);
    $("#stat-objects").textContent = state.objects.length;
    $("#stat-links").textContent = state.links.length;
    $("#stat-autos").textContent = state.objects.filter((o) => o.automation).length;
    document.title = `${state.company ? state.company + " · " : ""}Ontology Studio`;
  }

  /* ---------------------------------------------------------- interaction */
  function svgPoint(evt) {
    const pt = svg.createSVGPoint();
    pt.x = evt.clientX; pt.y = evt.clientY;
    const p = pt.matrixTransform(svg.getScreenCTM().inverse());
    return [p.x, p.y];
  }

  svg.addEventListener("pointerdown", (e) => {
    const node = e.target.closest(".node");
    if (!node) return;
    e.preventDefault();
    dragging = { id: node.dataset.id, moved: false, start: svgPoint(e) };
    svg.setPointerCapture(e.pointerId);
    node.classList.add("dragging");
  });
  svg.addEventListener("pointermove", (e) => {
    if (!dragging) {
      const node = e.target.closest(".node");
      const id = node ? node.dataset.id : null;
      if (id !== hover) { hover = id; applyHover(); }
      return;
    }
    const [x, y] = svgPoint(e);
    if (!dragging.moved && Math.hypot(x - dragging.start[0], y - dragging.start[1]) < 3) return;
    dragging.moved = true;
    const o = state.objects.find((n) => n.id === dragging.id);
    let [u, v] = unproject(x, y);
    u = clamp(u, 0.03, 0.97); v = clamp(v, 0.1, 0.95);
    state.positions[o.id] = { u, v };
    o._u = u; o._v = v; [o._x, o._y] = project(u, v);
    renderPositions();
  });
  // Selecting an object: the ring blooms, its links draw themselves, the card
  // slides in and traces a leader back to the disc. `choreo` arms those
  // animations for one render, so edits in the drawer do not replay them.
  function select(id) {
    state.selected = id;
    svg.classList.add("choreo"); $("#inspector").classList.add("choreo");
    render();
    clearTimeout(select._t);
    select._t = setTimeout(() => { svg.classList.remove("choreo"); $("#inspector").classList.remove("choreo"); }, 1400);
  }
  function renderFresh() {
    svg.classList.add("entering");
    render();
    clearTimeout(renderFresh._t);
    renderFresh._t = setTimeout(() => svg.classList.remove("entering"), 2000);
  }
  const endDrag = (e) => {
    if (!dragging) return;
    const { id, moved } = dragging;
    dragging = null;
    $$(".node.dragging", svg).forEach((n) => n.classList.remove("dragging"));
    if (!moved) select(id);
    else save();
  };
  svg.addEventListener("pointerup", endDrag);
  svg.addEventListener("pointercancel", endDrag);
  svg.addEventListener("pointerleave", () => { if (!dragging && hover) { hover = null; applyHover(); } });

  // Tiles: click a tile to rename it in place.
  svg.addEventListener("click", (e) => {
    const tile = e.target.closest(".tile");
    if (!tile) return;
    const tier = tile.dataset.tier, i = +tile.dataset.i;
    const cur = state.sources[tier][i];
    const next = prompt(`Rename ${BOTTOM_LABELS[TIER_KEYS.indexOf(tier)]} tile`, cur);
    if (next !== null && next.trim()) { state.sources[tier][i] = next.trim(); render(); }
  });

  document.addEventListener("keydown", (e) => {
    if (e.target.matches("input, textarea, select")) return;
    if (e.key === "ArrowRight") switchIndustry(1);
    if (e.key === "ArrowLeft") switchIndustry(-1);
    if (e.key === "Escape") closeDrawer();
  });

  /* ------------------------------------------------------------ industry */
  function switchIndustry(dir, key) {
    const i = INDUSTRY_ORDER.indexOf(state.industry);
    const nextKey = key || INDUSTRY_ORDER[(i + dir + INDUSTRY_ORDER.length) % INDUSTRY_ORDER.length];
    const stage = $("#stage-wrap");
    stage.classList.add("switching");
    setTimeout(() => {
      state = fromTemplate(nextKey, state.company);
      history.replaceState(null, "", location.pathname);
      stage.classList.remove("switching");
      renderFresh(); renderDrawer(); renderIndustryGrid();
    }, 220);
  }
  $("#prev-industry").addEventListener("click", () => switchIndustry(-1));
  $("#next-industry").addEventListener("click", () => switchIndustry(1));
  $("#industry-menu").innerHTML = INDUSTRY_ORDER.map((k) => `<button data-k="${k}"><svg viewBox="0 0 24 24">${ICONS[INDUSTRIES[k].icon]}</svg>${esc(INDUSTRIES[k].name)}</button>`).join("");
  $("#industry-menu").addEventListener("click", (e) => {
    const b = e.target.closest("button"); if (!b) return;
    $("#industry-menu").classList.remove("open");
    if (b.dataset.k !== state.industry) switchIndustry(0, b.dataset.k);
  });
  $("#industry-btn").addEventListener("click", () => $("#industry-menu").classList.toggle("open"));
  document.addEventListener("click", (e) => { if (!e.target.closest(".industry-switch")) $("#industry-menu").classList.remove("open"); });

  $("#company").addEventListener("input", (e) => { state.company = e.target.value; render(); });

  /* -------------------------------------------------------------- drawer */
  const drawer = $("#drawer");
  const openDrawer = () => { drawer.classList.add("open"); $("#backdrop").classList.add("open"); renderDrawer(); };
  const closeDrawer = () => { drawer.classList.remove("open"); $("#backdrop").classList.remove("open"); };
  $("#customize").addEventListener("click", openDrawer);
  $("#close-drawer").addEventListener("click", closeDrawer);
  $("#backdrop").addEventListener("click", closeDrawer);

  const iconOptions = (cur) => Object.keys(ICONS).map((k) => `<option value="${k}"${k === cur ? " selected" : ""}>${k}</option>`).join("");
  const objOptions = (cur) => state.objects.map((o) => `<option value="${esc(o.id)}"${o.id === cur ? " selected" : ""}>${esc(o.name)}</option>`).join("");
  const statusOptions = (cur) => STATUSES.map((k) => `<option value="${k}"${k === cur ? " selected" : ""}>${k}</option>`).join("");

  function renderDrawer() {
    if (!drawer.classList.contains("open")) return;
    const openSet = new Set($$(".obj.open", drawer).map((el) => el.dataset.id));
    $("#objects-list").innerHTML = state.objects.map((o) => `
      <div class="obj${openSet.has(o.id) ? " open" : ""}" data-id="${esc(o.id)}">
        <div class="obj-head">
          <button class="toggle" title="Properties">▸</button>
          <span class="obj-icon"><svg viewBox="0 0 24 24">${ICONS[o.icon] || ICONS.box}</svg></span>
          <input class="f-name" value="${esc(o.name)}" placeholder="Object name">
          <select class="f-icon">${iconOptions(o.icon)}</select>
          <input class="f-auto" value="${esc(o.automation)}" placeholder="Automation (optional)">
          <button class="del" title="Remove object">×</button>
        </div>
        <div class="obj-body">
          ${(o.props || []).map((p, i) => `<div class="prop" data-i="${i}">
            <input class="p-label" value="${esc(p.label)}" placeholder="Property">
            <input class="p-value" value="${esc(p.value)}" placeholder="Sample value">
            <select class="p-status">${statusOptions(p.status)}</select>
            <button class="del-prop" title="Remove">×</button></div>`).join("")}
          <button class="add-prop link-btn">+ Add property</button>
        </div>
      </div>`).join("");
    $("#links-list").innerHTML = state.links.map((l, i) => `
      <div class="lnk" data-i="${i}">
        <select class="l-source">${objOptions(l.source)}</select>
        <input class="l-verb" value="${esc(l.verb)}" placeholder="verb">
        <select class="l-target">${objOptions(l.target)}</select>
        <button class="del-link" title="Remove link">×</button>
      </div>`).join("");
    TIER_KEYS.forEach((k) => { $(`#src-${k}`).value = (state.sources[k] || []).join("\n"); });
    $("#drawer-industry").value = state.industry;
  }
  $("#drawer-industry").innerHTML = INDUSTRY_ORDER.map((k) => `<option value="${k}">${esc(INDUSTRIES[k].name)}</option>`).join("");
  $("#drawer-industry").addEventListener("change", (e) => switchIndustry(0, e.target.value));
  $("#reset-template").addEventListener("click", () => { if (confirm("Reset the ontology to the industry template? Your edits will be lost.")) switchIndustry(0, state.industry); });

  drawer.addEventListener("click", (e) => {
    const obj = e.target.closest(".obj");
    if (e.target.matches(".toggle")) { obj.classList.toggle("open"); return; }
    if (e.target.matches(".del")) {
      state.objects = state.objects.filter((o) => o.id !== obj.dataset.id);
      state.links = state.links.filter((l) => l.source !== obj.dataset.id && l.target !== obj.dataset.id);
      if (state.selected === obj.dataset.id) state.selected = state.objects[0]?.id;
      render(); renderDrawer(); return;
    }
    if (e.target.matches(".add-prop")) {
      const o = state.objects.find((x) => x.id === obj.dataset.id);
      (o.props = o.props || []).push({ label: "New property", value: "—", status: "neutral" });
      render(); renderDrawer(); return;
    }
    if (e.target.matches(".del-prop")) {
      const o = state.objects.find((x) => x.id === obj.dataset.id);
      o.props.splice(+e.target.closest(".prop").dataset.i, 1);
      render(); renderDrawer(); return;
    }
    if (e.target.matches(".del-link")) {
      state.links.splice(+e.target.closest(".lnk").dataset.i, 1);
      render(); renderDrawer(); return;
    }
  });
  drawer.addEventListener("input", (e) => {
    const obj = e.target.closest(".obj");
    if (obj) {
      const o = state.objects.find((x) => x.id === obj.dataset.id);
      if (e.target.matches(".f-name")) o.name = e.target.value;
      if (e.target.matches(".f-icon")) { o.icon = e.target.value; $(".obj-icon", obj).innerHTML = `<svg viewBox="0 0 24 24">${ICONS[o.icon]}</svg>`; }
      if (e.target.matches(".f-auto")) o.automation = e.target.value;
      const prop = e.target.closest(".prop");
      if (prop) {
        const p = o.props[+prop.dataset.i];
        if (e.target.matches(".p-label")) p.label = e.target.value;
        if (e.target.matches(".p-value")) p.value = e.target.value;
        if (e.target.matches(".p-status")) p.status = e.target.value;
      }
      render(); return;
    }
    const lnk = e.target.closest(".lnk");
    if (lnk) {
      const l = state.links[+lnk.dataset.i];
      if (e.target.matches(".l-source")) l.source = e.target.value;
      if (e.target.matches(".l-target")) l.target = e.target.value;
      if (e.target.matches(".l-verb")) l.verb = e.target.value;
      render(); return;
    }
    if (e.target.matches(".src")) {
      state.sources[e.target.dataset.tier] = e.target.value.split("\n").map((s) => s.trim()).filter(Boolean).slice(0, 6);
      render();
    }
  });
  $("#add-object").addEventListener("click", () => {
    const name = ($("#new-object").value || "New Object").trim();
    let id = name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "object";
    while (state.objects.some((o) => o.id === id)) id += "-2";
    state.objects.push({ id, name, icon: "box", props: [], automation: "" });
    $("#new-object").value = "";
    select(id); renderDrawer();
    $(`.obj[data-id="${id}"]`, drawer)?.classList.add("open");
  });
  $("#new-object").addEventListener("keydown", (e) => { if (e.key === "Enter") $("#add-object").click(); });
  $("#add-link").addEventListener("click", () => {
    if (state.objects.length < 2) return;
    state.links.push({ source: state.objects[0].id, target: state.objects[1].id, verb: "relates to" });
    render(); renderDrawer();
  });
  $("#relayout").addEventListener("click", () => { state.positions = {}; render(); });

  /* ------------------------------------------------------- share / export */
  const toast = (msg) => { const t = $("#toast"); t.textContent = msg; t.classList.add("show"); clearTimeout(toast._t); toast._t = setTimeout(() => t.classList.remove("show"), 2200); };
  const download = (name, blob) => { const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = name; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 1000); };
  const fileBase = () => (state.company || "ontology").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "ontology";

  $("#share").addEventListener("click", async () => {
    const url = `${location.origin}${location.pathname}#s=${await encodeState()}`;
    history.replaceState(null, "", url);
    try { await navigator.clipboard.writeText(url); toast("Share link copied to clipboard"); }
    catch (_) { toast("Share link is in the address bar"); }
  });
  $("#export-json").addEventListener("click", () => {
    const { company, industry, objects, links, sources, positions } = state;
    const clean = { company, industry, sources, positions, links, objects: objects.map(({ id, name, icon, props, automation }) => ({ id, name, icon, props, automation })) };
    download(`${fileBase()}-ontology.json`, new Blob([JSON.stringify(clean, null, 2)], { type: "application/json" }));
  });
  $("#import-json").addEventListener("change", (e) => {
    const f = e.target.files[0]; if (!f) return;
    f.text().then((t) => {
      const s = JSON.parse(t);
      if (!validState(s)) throw new Error("bad");
      state = { positions: {}, ...s, selected: s.selected || s.objects[0]?.id };
      render(); renderDrawer(); toast("Ontology imported");
    }).catch(() => toast("That file is not an Ontology Studio export")).finally(() => { e.target.value = ""; });
  });

  /* ----------------------------------------------- ontology exports */
  const slug = (t) => String(t || "").toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "") || "x";
  const pascal = (t) => String(t || "").replace(/[^a-zA-Z0-9]+(.)?/g, (_, c) => (c ? c.toUpperCase() : "")).replace(/^./, (c) => c.toUpperCase()) || "Thing";
  const ttlStr = (t) => JSON.stringify(String(t ?? ""));
  const STUDIO_NS = "https://vivkv07.github.io/dotcorp/vocab#";
  function ontologyBase() {
    return `https://vivkv07.github.io/dotcorp/ontology/${slug(state.company || "your-company")}#`;
  }
  // The shared model behind all three formats: classes, datatype properties
  // with sample values, object properties (one per link), and the source tiers.
  function ontologyModel() {
    const base = ontologyBase();
    const cls = (o) => base + pascal(o.name);
    const byId = new Map(state.objects.map((o) => [o.id, o]));
    const classes = state.objects.map((o) => ({
      iri: cls(o), label: o.name, icon: o.icon, automation: o.automation || null,
      props: (o.props || []).map((p) => ({ iri: base + slug(o.name) + "_" + slug(p.label), label: p.label, sample: p.value, status: p.status || "neutral" })),
    }));
    const links = state.links.filter((l) => byId.has(l.source) && byId.has(l.target)).map((l) => {
      const a = byId.get(l.source), b = byId.get(l.target);
      return { iri: base + slug(a.name) + "_" + slug(l.verb || "relates to") + "_" + slug(b.name), label: l.verb || "relates to", domain: cls(a), range: cls(b), a, b };
    });
    const tierClass = { data: "DataSource", logic: "LogicSource", action: "SystemOfAction" };
    const sources = TIER_KEYS.flatMap((k) => (state.sources[k] || []).map((t) => ({ iri: base + "source_" + slug(t), label: t, type: STUDIO_NS + tierClass[k] })));
    return { base, classes, links, sources, title: `${state.company || "Your company"} ontology`, industry: INDUSTRIES[state.industry].name };
  }
  function exportTurtle() {
    const m = ontologyModel();
    const q = (iri) => iri.startsWith(m.base) ? ":" + iri.slice(m.base.length) : iri.startsWith(STUDIO_NS) ? "os:" + iri.slice(STUDIO_NS.length) : `<${iri}>`;
    const today = new Date().toISOString().slice(0, 10);
    let out = `@prefix : <${m.base}> .\n@prefix os: <${STUDIO_NS}> .\n@prefix owl: <http://www.w3.org/2002/07/owl#> .\n@prefix rdf: <http://www.w3.org/1999/02/22-rdf-syntax-ns#> .\n@prefix rdfs: <http://www.w3.org/2000/01/rdf-schema#> .\n@prefix xsd: <http://www.w3.org/2001/XMLSchema#> .\n@prefix dcterms: <http://purl.org/dc/terms/> .\n\n`;
    out += `<${m.base.slice(0, -1)}> a owl:Ontology ;\n    rdfs:label ${ttlStr(m.title)} ;\n    dcterms:created "${today}"^^xsd:date ;\n    dcterms:description ${ttlStr(`Object types, links and automations for a ${m.industry.toLowerCase()} business, drawn in Ontology Studio.`)} .\n\n### Object types\n`;
    m.classes.forEach((c) => {
      out += `\n${q(c.iri)} a owl:Class ;\n    rdfs:label ${ttlStr(c.label)} ;\n    os:icon ${ttlStr(c.icon)}` + (c.automation ? ` ;\n    os:automation ${ttlStr(c.automation)}` : "") + ` .\n`;
      c.props.forEach((p) => {
        out += `${q(p.iri)} a owl:DatatypeProperty ;\n    rdfs:label ${ttlStr(p.label)} ;\n    rdfs:domain ${q(c.iri)} ;\n    rdfs:range xsd:string ;\n    os:sampleValue ${ttlStr(p.sample)} ;\n    os:status ${ttlStr(p.status)} .\n`;
      });
    });
    out += `\n### Links\n`;
    m.links.forEach((l) => {
      out += `\n${q(l.iri)} a owl:ObjectProperty ;\n    rdfs:label ${ttlStr(l.label)} ;\n    rdfs:domain ${q(l.domain)} ;\n    rdfs:range ${q(l.range)} .\n`;
    });
    out += `\n### Sources feeding and consuming the ontology\n`;
    m.sources.forEach((s) => { out += `${q(s.iri)} a ${q(s.type)} ;\n    rdfs:label ${ttlStr(s.label)} .\n`; });
    return out;
  }
  function exportJsonLd() {
    const m = ontologyModel();
    const graph = [{ "@id": m.base.slice(0, -1), "@type": "owl:Ontology", label: m.title, "dcterms:created": new Date().toISOString().slice(0, 10) }];
    m.classes.forEach((c) => {
      graph.push({ "@id": c.iri, "@type": "owl:Class", label: c.label, icon: c.icon, ...(c.automation ? { automation: c.automation } : {}) });
      c.props.forEach((p) => graph.push({ "@id": p.iri, "@type": "owl:DatatypeProperty", label: p.label, domain: c.iri, range: "xsd:string", sampleValue: p.sample, status: p.status }));
    });
    m.links.forEach((l) => graph.push({ "@id": l.iri, "@type": "owl:ObjectProperty", label: l.label, domain: l.domain, range: l.range }));
    m.sources.forEach((s) => graph.push({ "@id": s.iri, "@type": s.type, label: s.label }));
    return JSON.stringify({
      "@context": {
        "@vocab": STUDIO_NS,
        owl: "http://www.w3.org/2002/07/owl#", rdfs: "http://www.w3.org/2000/01/rdf-schema#", xsd: "http://www.w3.org/2001/XMLSchema#", dcterms: "http://purl.org/dc/terms/",
        label: "rdfs:label", domain: { "@id": "rdfs:domain", "@type": "@id" }, range: { "@id": "rdfs:range", "@type": "@id" },
      },
      "@graph": graph,
    }, null, 2);
  }
  function exportMermaid() {
    const m = ontologyModel();
    const name = (label) => /^[A-Za-z_][A-Za-z0-9_]*$/.test(label) ? label : "`" + label + "`";
    let out = `classDiagram\n    %% ${m.title} (${m.industry}), drawn in Ontology Studio\n    direction LR\n`;
    m.classes.forEach((c) => {
      out += `    class ${name(c.label)} {\n`;
      if (c.automation) out += `        <<automation: ${c.automation}>>\n`;
      c.props.forEach((p) => { out += `        +${p.label.replace(/[^\w ]/g, "")} ${String(p.sample).replace(/[{}]/g, "")}\n`; });
      out += `    }\n`;
    });
    m.links.forEach((l) => { out += `    ${name(l.a.name)} --> ${name(l.b.name)} : ${l.label}\n`; });
    return out;
  }
  $("#export-ttl").addEventListener("click", () => download(`${fileBase()}-ontology.ttl`, new Blob([exportTurtle()], { type: "text/turtle" })));
  $("#export-jsonld").addEventListener("click", () => download(`${fileBase()}-ontology.jsonld`, new Blob([exportJsonLd()], { type: "application/ld+json" })));
  $("#export-mermaid").addEventListener("click", () => download(`${fileBase()}-ontology.mmd`, new Blob([exportMermaid()], { type: "text/plain" })));
  $("#copy-mermaid").addEventListener("click", async () => {
    try { await navigator.clipboard.writeText(exportMermaid()); toast("Mermaid diagram copied"); }
    catch (_) { download(`${fileBase()}-ontology.mmd`, new Blob([exportMermaid()], { type: "text/plain" })); }
  });

  function exportSvgString() {
    const clone = svg.cloneNode(true);
    clone.setAttribute("xmlns", "http://www.w3.org/2000/svg");
    clone.setAttribute("width", VB.w); clone.setAttribute("height", VB.h);
    const css = Array.from(document.styleSheets).filter((s) => { try { return s.cssRules && (s.href || "").includes("style.css") || !s.href; } catch (_) { return false; } })
      .flatMap((s) => Array.from(s.cssRules)).map((r) => r.cssText).filter((t) => /(#stage|#arrow|\.stage|\.node|\.edge|\.pill |\.pill-|\.slab|\.wire|\.tile|\.card|\.tier|\.mon|\.mini|\.icon|\.ontology|\.grid line|\.hit|\.disc|\.dot-|\.row|:root|prefers-color-scheme|@keyframes)/.test(t) && !/\.stage-wrap|\.stage-tilt|\.stagesec/.test(t)).join("\n");
    const style = document.createElementNS("http://www.w3.org/2000/svg", "style");
    style.textContent = `@import url('https://fonts.googleapis.com/css2?family=Space+Mono:wght@400;700&display=swap');\n${css}`;
    clone.insertBefore(style, clone.firstChild);
    $$(".hit", clone).forEach((h) => h.remove());
    return new XMLSerializer().serializeToString(clone);
  }
  $("#export-svg").addEventListener("click", () => download(`${fileBase()}-ontology.svg`, new Blob([exportSvgString()], { type: "image/svg+xml" })));
  $("#export-png").addEventListener("click", () => {
    const img = new Image();
    const url = URL.createObjectURL(new Blob([exportSvgString()], { type: "image/svg+xml" }));
    img.onload = () => {
      const c = document.createElement("canvas"); c.width = VB.w * 2; c.height = VB.h * 2;
      const ctx = c.getContext("2d"); ctx.fillStyle = getComputedStyle(document.documentElement).getPropertyValue("--bg").trim() || "#fff"; ctx.fillRect(0, 0, c.width, c.height);
      ctx.drawImage(img, 0, 0, c.width, c.height);
      c.toBlob((b) => download(`${fileBase()}-ontology.png`, b), "image/png");
      URL.revokeObjectURL(url);
    };
    img.onerror = () => toast("PNG export failed in this browser — try SVG");
    img.src = url;
  });

  /* ------------------------------------------------------- page motion */
  const fine = matchMedia("(hover: hover) and (pointer: fine)").matches;
  const still = matchMedia("(prefers-reduced-motion: reduce)").matches;

  // The stage tilts toward the cursor, as a sheet lying on a desk would.
  const tiltEl = $(".stage-tilt");
  const wrap = $("#stage-wrap");
  wrap.addEventListener("pointermove", (e) => {
    if (!fine || still || dragging) return;
    const r = wrap.getBoundingClientRect();
    const x = (e.clientX - r.left) / r.width - 0.5, y = (e.clientY - r.top) / r.height - 0.5;
    tiltEl.style.setProperty("--ry", `${(x * 2 * 1.6).toFixed(2)}deg`);
    tiltEl.style.setProperty("--rx", `${(-y * 2 * 1.6).toFixed(2)}deg`);
  });
  wrap.addEventListener("pointerleave", () => { tiltEl.style.setProperty("--rx", "0deg"); tiltEl.style.setProperty("--ry", "0deg"); });

  // Generic tilt for cards (industry grid).
  document.addEventListener("pointermove", (e) => {
    const t = e.target.closest(".tilt");
    if (!t || !fine || still) return;
    const r = t.getBoundingClientRect();
    const x = (e.clientX - r.left) / r.width - 0.5, y = (e.clientY - r.top) / r.height - 0.5;
    t.style.setProperty("--ry", `${(x * 2 * 5).toFixed(2)}deg`);
    t.style.setProperty("--rx", `${(-y * 2 * 5).toFixed(2)}deg`);
  });
  document.addEventListener("pointerout", (e) => {
    const t = e.target.closest && e.target.closest(".tilt");
    if (t && !t.contains(e.relatedTarget)) { t.style.setProperty("--rx", "0deg"); t.style.setProperty("--ry", "0deg"); }
  });

  // Sections below the fold arrive tipped away and rise upright as they enter.
  function scrollDepth() {
    if (still) return;
    const below = $$("main section.depthable").filter((s) => s.getBoundingClientRect().top > innerHeight * 0.92);
    below.forEach((s) => s.classList.add("depth"));
    const io = new IntersectionObserver((entries) => {
      entries.forEach((en) => { if (en.isIntersecting) { en.target.classList.add("in"); io.unobserve(en.target); } });
    }, { rootMargin: "0px 0px -6% 0px", threshold: 0 });
    below.forEach((s) => io.observe(s));
  }

  // Industry grid: one card per template, tilting toward the cursor.
  function renderIndustryGrid() {
    $("#industry-grid").innerHTML = INDUSTRY_ORDER.map((k) => {
      const t = INDUSTRIES[k];
      const autos = t.objects.filter((o) => o.automation).length;
      return `<button type="button" class="icard tilt" data-k="${k}" aria-current="${k === state.industry}">
        <div class="ihead"><svg viewBox="0 0 24 24">${ICONS[t.icon]}</svg><h3>${esc(t.name)}</h3></div>
        <p class="meta">${t.objects.length} object types · ${t.links.length} links · ${autos} automations</p>
        <ul>${t.objects.slice(0, 4).map((o) => `<li>${esc(o.name)}</li>`).join("")}</ul>
      </button>`;
    }).join("");
  }
  $("#industry-grid").addEventListener("click", (e) => {
    const b = e.target.closest(".icard"); if (!b) return;
    if (b.dataset.k !== state.industry) switchIndustry(0, b.dataset.k);
    $("#stage-wrap").scrollIntoView({ behavior: still ? "auto" : "smooth", block: "start" });
  });
  $("#relayout-top").addEventListener("click", () => { state.positions = {}; renderFresh(); });

  /* ---------------------------------------------------------------- boot */
  loadInitial().then((s) => {
    state = s;
    const go = () => {
      renderFresh(); renderIndustryGrid();
      document.body.classList.add("ready");
      scrollDepth();
    };
    if (document.fonts && document.fonts.load) Promise.all([document.fonts.load('700 12px "Space Mono"'), document.fonts.load('400 12px "Space Mono"')]).then(go, go); else go();
  });
})();
