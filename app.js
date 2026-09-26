/* Ontology Studio — interactive Foundry-style ontology diagram
   Layout: three tiers on a 1500×940 stage.
     top    : Analytics & Workflows / Automations / Products & SDKs
     middle : the Ontology slab — object discs, verb pills, automations, property card
     bottom : Data Sources / Logic Sources / Systems of Action                          */

(() => {
  "use strict";

  /* ---------------------------------------------------------------- geometry */
  const VB = { w: 1500, h: 1000 };
  // Ontology slab top face (a trapezoid seen in perspective).
  const SLAB = { tl: [280, 390], tr: [1220, 390], br: [1330, 690], bl: [170, 690], depth: 20 };
  const PLANE = { u0: 0.13, u1: 0.95, v0: 0.18, v1: 0.86 };
  const TOP_X = [330, 750, 1170];
  const BOTTOM_X = [330, 750, 1170];
  const TOP_LABELS = ["Analytics & Workflows", "Automations", "Products & SDKs"];
  const BOTTOM_LABELS = ["Data Sources", "Logic Sources", "Systems of Action"];
  const TIER_KEYS = ["data", "logic", "action"];
  const TIER_CLASS = ["tile-data", "tile-logic", "tile-action"];
  const STATUS_COLOR = { ok: "#22a06b", warn: "#f0a020", bad: "#e5484d", info: "#4f7df3", neutral: "#9aa0ab" };

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

    const layout = {};
    cols.forEach((col, c) => {
      const u = lerp(PLANE.u0, PLANE.u1, cols.length === 1 ? 0.5 : c / (cols.length - 1));
      const pitch = cols.length > 1 ? (PLANE.u1 - PLANE.u0) / (cols.length - 1) : 0.3;
      col.forEach((id, i) => {
        const shift = c % 2 ? 0.05 : -0.05;
        let v, uu = u;
        if (col.length === 1) v = 0.5 + shift * 4;
        else if (col.length === 2) v = lerp(PLANE.v0 + 0.1, PLANE.v1 - 0.1, i) + shift;
        else if (col.length === 3) v = lerp(PLANE.v0, PLANE.v1, i / 2) + (i === 1 ? shift : 0);
        else { // crowded column: zig-zag sideways so discs and labels stay readable
          v = lerp(PLANE.v0 - 0.02, PLANE.v1 + 0.04, i / (col.length - 1));
          uu = u + (i % 2 ? 0.3 : -0.3) * pitch;
        }
        layout[id] = { u: clamp(uu, 0.08, 0.97), v: clamp(v, PLANE.v0 - 0.04, PLANE.v1 + 0.04) };
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
  function pill(x, y, text, cls, size = 11, padX = 9, h = 20, anchor = "middle", extra = "") {
    const w = textW(text, size) + padX * 2;
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
    // Small line-art "screen" with a schematic chart, list or tree inside.
    let inner = "";
    const ix = x + 8, iy = y + 8, iw = w - 16, ih = h - 16;
    if (kind === "line") {
      const pts = [0, .2, .35, .5, .65, .8, 1].map((t, i) => [ix + t * iw, iy + ih * (0.75 - 0.5 * Math.abs(Math.sin(i * 1.7)))]);
      inner = `<polyline class="mini-line" points="${pts.map((p) => p.map((n) => n.toFixed(1)).join(",")).join(" ")}"/>` +
        pts.map((p) => `<circle class="mini-dot" cx="${p[0].toFixed(1)}" cy="${p[1].toFixed(1)}" r="2.2"/>`).join("");
    } else if (kind === "bars") {
      inner = [.3, .55, .45, .8, .6, .9, .5].map((v, i) => `<rect class="mini-bar" x="${(ix + i * iw / 7 + 2).toFixed(1)}" y="${(iy + ih * (1 - v)).toFixed(1)}" width="${(iw / 7 - 4).toFixed(1)}" height="${(ih * v).toFixed(1)}"/>`).join("");
    } else if (kind === "map") {
      inner = `<path class="mini-map" d="M${ix + 4},${iy + ih * .6} q${iw * .2},-${ih * .5} ${iw * .4},-${ih * .2} t${iw * .3},${ih * .1} t${iw * .2},${ih * .3}"/>` +
        [[.3, .4], [.55, .35], [.7, .6], [.45, .7]].map(([a, b]) => `<circle class="mini-pin" cx="${(ix + a * iw).toFixed(1)}" cy="${(iy + b * ih).toFixed(1)}" r="3"/>`).join("");
    } else if (kind === "list") {
      inner = [0, 1, 2, 3, 4].map((i) => `<rect class="mini-row" x="${ix}" y="${(iy + i * ih / 5 + 2).toFixed(1)}" width="${iw}" height="${(ih / 5 - 5).toFixed(1)}" rx="2"/><circle class="mini-check" cx="${ix + 6}" cy="${(iy + i * ih / 5 + ih / 10).toFixed(1)}" r="2.2"/>`).join("");
    } else if (kind === "kanban") {
      inner = [0, 1, 2].map((c) => [0, 1, 2].slice(0, 3 - (c % 2)).map((r) => `<rect class="mini-card" x="${(ix + c * iw / 3 + 2).toFixed(1)}" y="${(iy + r * ih / 3 + 2).toFixed(1)}" width="${(iw / 3 - 4).toFixed(1)}" height="${(ih / 3 - 4).toFixed(1)}" rx="2"/>`).join("")).join("");
    } else if (kind === "tree") {
      const cx = ix + iw / 2, r1 = iy + 6, r2 = iy + ih / 2, r3 = iy + ih - 6;
      inner = `<path class="mini-tree" d="M${cx},${r1} v${r2 - r1 - 6} M${ix + iw * .2},${r2} H${ix + iw * .8} M${ix + iw * .2},${r2} v${r3 - r2 - 6} M${ix + iw * .8},${r2} v${r3 - r2 - 6} M${cx},${r2} v${r3 - r2 - 6}"/>` +
        [[cx, r1], [ix + iw * .2, r3 - 3], [cx, r3 - 3], [ix + iw * .8, r3 - 3]].map(([a, b]) => `<rect class="mini-node" x="${(a - 9).toFixed(1)}" y="${(b - 4).toFixed(1)}" width="18" height="8" rx="2"/>`).join("");
    } else if (kind === "action") {
      inner = `<rect class="mini-row" x="${ix}" y="${iy}" width="${iw}" height="${ih * .3}" rx="2"/><rect class="mini-action" x="${ix}" y="${(iy + ih * .45).toFixed(1)}" width="${iw * .6}" height="${ih * .3}" rx="4"/><text class="mini-text" x="${(ix + iw * .3).toFixed(1)}" y="${(iy + ih * .66).toFixed(1)}" font-size="7">ACTION</text>`;
    }
    return `<g class="monitor"><rect class="mon-frame" x="${x}" y="${y}" width="${w}" height="${h}" rx="3"/>
      <path class="mon-bar" d="M${x + 4},${y + 5} h${w - 8}"/><circle class="mon-btn" cx="${x + w - 7}" cy="${y + 5}" r="1.5"/>
      ${inner}
      <path class="mon-stand" d="M${x + w / 2 - 10},${y + h + 8} h20 M${x + w / 2},${y + h} v8"/></g>`;
  }

  function topTier() {
    let out = "";
    TOP_X.forEach((cx, k) => {
      out += `<text class="tier-label" x="${cx}" y="102">${esc(TOP_LABELS[k]).toUpperCase()}</text>`;
      out += slab(cx, 250, 300, 300, 350, 12, "tier-slab");
      if (k === 0) out += monitor(cx - 120, 132, 105, 78, "line") + monitor(cx + 10, 148, 110, 80, "map") + monitor(cx - 60, 190, 100, 62, "bars");
      if (k === 1) out += monitor(cx - 115, 150, 95, 75, "list") + monitor(cx - 20, 132, 110, 84, "kanban") + monitor(cx + 45, 178, 70, 60, "line");
      if (k === 2) out += monitor(cx - 120, 140, 100, 75, "action") + monitor(cx + 15, 138, 110, 80, "tree") + monitor(cx - 55, 190, 100, 60, "list");
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
    let out = "";
    const starts = [], ends = [];
    BOTTOM_X.forEach((cx, k) => {
      out += slab(cx, 740, 330, 908, 380, 14, "tier-slab");
      const tiles = state.sources[TIER_KEYS[k]] || [];
      tiles.slice(0, 6).forEach((t, i) => {
        const col = i % 2, r = Math.floor(i / 2);
        const x = cx - 150 + col * 152, y = 753 + r * 46;
        out += `<g class="tile ${TIER_CLASS[k]}" data-tier="${TIER_KEYS[k]}" data-i="${i}"><rect x="${x}" y="${y}" width="148" height="38" rx="3"/><text x="${x + 74}" y="${y + 23}" font-size="11">${esc(t).toUpperCase()}</text></g>`;
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
      <text x="${S.bl[0] + 32}" y="${S.bl[1] + 11}" font-size="11">ONTOLOGY · ${esc((state.company || "Your Company").toUpperCase())}</text></g>`;
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
      const cands = [[0, -58], [0, 54], [-60, -46], [60, -46], [0, -58]];
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
      return `<g class="edge" data-i="${i}" data-s="${esc(a.id)}" data-t="${esc(b.id)}">
        <line class="edge-line" x1="${a._x.toFixed(1)}" y1="${a._y.toFixed(1)}" x2="${ex.toFixed(1)}" y2="${ey.toFixed(1)}" marker-end="url(#arrow)"/>
        ${pill(mx, my, verb, "pill-verb", 10, 8, 18)}${extra}
      </g>`;
    }).join("");
  }

  function nodesMarkup() {
    return state.objects.map((o) => {
      const sel = o.id === state.selected ? " selected" : "";
      let auto = "";
      if (o.automation) {
        const [dx, dy] = actionSpot.get(o.id) || [0, -58];
        auto = pill(dx, dy, o.automation + " →", "pill-action", 10, 9, 19);
        if (autoUnderNode.has(o.id)) auto += pill(0, dy === 54 ? 74 : 47, "⚡ Automation", "pill-auto", 8.5, 7, 15);
      }
      return `<g class="node${sel}" data-id="${esc(o.id)}" transform="translate(${o._x.toFixed(1)} ${o._y.toFixed(1)})">
        <ellipse class="disc-shadow" cx="0" cy="6" rx="38" ry="19"/>
        <ellipse class="disc" cx="0" cy="0" rx="38" ry="19"/>
        <ellipse class="disc-ring" cx="0" cy="0" rx="44" ry="23"/>
        ${icon(o.icon, 0, -20, 30)}
        ${pill(0, 27, o.name, "pill-object", 11, 10, 21)}
        ${auto}
        <ellipse class="hit" cx="0" cy="0" rx="46" ry="30"/>
      </g>`;
    }).join("");
  }

  function cardMarkup() {
    const o = state.objects.find((x) => x.id === state.selected);
    if (!o) return "";
    const x = 28, y = 410, w = 240, rowH = 21;
    const rows = o.props || [];
    const h = 46 + rows.length * rowH + 10;
    let out = `<g class="card"><rect class="card-bg" x="${x}" y="${y}" width="${w}" height="${h}" rx="3"/>
      <text class="card-title" x="${x + 14}" y="${y + 24}" font-size="12">${esc(o.name.toUpperCase())} OBJECT</text>
      <line class="card-rule" x1="${x + 14}" y1="${y + 34}" x2="${x + w - 14}" y2="${y + 34}"/>`;
    rows.forEach((p, i) => {
      const ry = y + 52 + i * rowH;
      out += `<text class="card-label" x="${x + 14}" y="${ry}" font-size="10">${esc(p.label)}</text>
        <circle cx="${x + w - 14 - textW(p.value, 10) - 10}" cy="${ry - 3.5}" r="3" fill="${STATUS_COLOR[p.status] || STATUS_COLOR.neutral}"/>
        <text class="card-value" x="${x + w - 14}" y="${ry}" font-size="10" text-anchor="end">${esc(p.value)}</text>`;
    });
    if (!rows.length) out += `<text class="card-label" x="${x + 14}" y="${y + 52}" font-size="10">No properties yet — add some in Customize.</text>`;
    // leader line to the selected node
    const nx = o._x - 40, ny = o._y;
    const sx = x + w, sy = y + Math.min(h / 2, 60);
    out += `<path class="card-leader" d="M${sx},${sy} C${sx + 40},${sy} ${nx - 40},${ny} ${nx},${ny}"/><circle class="card-leader-dot" cx="${nx}" cy="${ny}" r="2.5"/></g>`;
    return out;
  }

  function render() {
    computeLayout();
    svg.innerHTML = `
      <defs>
        <marker id="arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z"/></marker>
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
    $("#hero-company").textContent = state.company ? `${state.company}'s` : "your company's";
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
  const endDrag = (e) => {
    if (!dragging) return;
    const { id, moved } = dragging;
    dragging = null;
    $$(".node.dragging", svg).forEach((n) => n.classList.remove("dragging"));
    if (!moved) { state.selected = id; render(); }
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
      render(); renderDrawer();
      stage.classList.remove("switching");
    }, 180);
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
  const statusOptions = (cur) => Object.keys(STATUS_COLOR).map((k) => `<option value="${k}"${k === cur ? " selected" : ""}>${k}</option>`).join("");

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
    state.selected = id;
    $("#new-object").value = "";
    render(); renderDrawer();
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

  function exportSvgString() {
    const clone = svg.cloneNode(true);
    clone.setAttribute("xmlns", "http://www.w3.org/2000/svg");
    clone.setAttribute("width", VB.w); clone.setAttribute("height", VB.h);
    const css = Array.from(document.styleSheets).filter((s) => { try { return s.cssRules && (s.href || "").includes("style.css") || !s.href; } catch (_) { return false; } })
      .flatMap((s) => Array.from(s.cssRules)).map((r) => r.cssText).filter((t) => /(#stage|\.stage|\.node|\.edge|\.pill|\.slab|\.wire|\.tile|\.card|\.tier|\.mon|\.mini|\.icon|\.ontology|\.grid|\.hit|\.disc|\.auto|:root)/.test(t)).join("\n");
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
      const ctx = c.getContext("2d"); ctx.fillStyle = "#f7f7f9"; ctx.fillRect(0, 0, c.width, c.height);
      ctx.drawImage(img, 0, 0, c.width, c.height);
      c.toBlob((b) => download(`${fileBase()}-ontology.png`, b), "image/png");
      URL.revokeObjectURL(url);
    };
    img.onerror = () => toast("PNG export failed in this browser — try SVG");
    img.src = url;
  });

  /* ---------------------------------------------------------------- boot */
  loadInitial().then((s) => {
    state = s;
    const go = () => { render(); document.body.classList.add("ready"); };
    if (document.fonts && document.fonts.load) document.fonts.load('11px "Space Mono"').then(go, go); else go();
  });
})();
