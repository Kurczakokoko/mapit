export const UI_HTML = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8"/>
  <meta name="viewport" content="width=device-width, initial-scale=1"/>
  <title>Mapit</title>
  <link rel="icon" href="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'%3E%3Crect width='32' height='32' fill='%230c1016'/%3E%3Ctext x='16' y='23' text-anchor='middle' font-size='18' font-family='Palatino,serif' fill='%23c4a35a'%3EM%3C/text%3E%3C/svg%3E"/>
  <style>
    :root {
      --ink: #0c1016;
      --panel: #141a22;
      --line: #2a3340;
      --gold: #c4a35a;
      --paper: #d8cbb3;
      --mute: #8b93a0;
      --ok: #6aa84f;
      --bad: #c45c4a;
    }
    * { box-sizing: border-box; }
    html, body { margin: 0; height: 100%; background: var(--ink); color: var(--paper); font: 13px/1.45 "IBM Plex Sans", "Segoe UI", sans-serif; }
    button, select { font: inherit; }
    #app { display: grid; grid-template-columns: 220px 1fr 280px; grid-template-rows: 48px 1fr 72px; height: 100%; }
    header { grid-column: 1 / -1; display: flex; align-items: center; gap: 18px; padding: 0 16px; border-bottom: 1px solid var(--line); background: #10161d; }
    .mark { font-family: Palatino, "Palatino Linotype", serif; letter-spacing: 0.18em; color: var(--gold); font-size: 15px; }
    .meta { color: var(--mute); }
    .badge { padding: 2px 8px; border: 1px solid var(--line); border-radius: 999px; }
    .badge.ok { color: var(--ok); border-color: #335534; }
    .badge.bad { color: var(--bad); border-color: #6a332c; }
    aside, .inspector { background: var(--panel); border-right: 1px solid var(--line); overflow: hidden; padding: 12px; display: flex; flex-direction: column; min-height: 0; }
    .inspector { border-right: 0; border-left: 1px solid var(--line); }
    #brushes { overflow: auto; flex: 1; min-height: 0; margin-top: 8px; }
    #errors { overflow: auto; flex: 1; min-height: 0; }
    #stage { position: relative; overflow: hidden; background: #080b0f; }
    canvas { image-rendering: pixelated; cursor: crosshair; display: block; }
    #hud { position: absolute; left: 10px; bottom: 10px; display: flex; gap: 6px; align-items: center; pointer-events: none; }
    #hud .btn { pointer-events: auto; padding: 5px 10px; }
    #zoomlabel { color: var(--mute); font-variant-numeric: tabular-nums; padding: 0 6px; }
    h2 { margin: 0 0 8px; font-size: 11px; letter-spacing: 0.12em; text-transform: uppercase; color: var(--gold); font-weight: 600; }
    .brush { display: flex; align-items: center; gap: 8px; padding: 5px 6px; border-radius: 4px; cursor: pointer; }
    .brush.on { background: #1d2733; outline: 1px solid var(--gold); }
    .swatch { width: 12px; height: 12px; border-radius: 2px; flex: none; }
    label { display: block; color: var(--mute); margin: 8px 0 4px; }
    select, input { width: 100%; background: #0c1016; color: var(--paper); border: 1px solid var(--line); padding: 6px 8px; border-radius: 4px; }
    footer { grid-column: 1 / -1; display: flex; align-items: center; gap: 10px; padding: 0 16px; border-top: 1px solid var(--line); background: #10161d; }
    .btn { background: #1b232e; color: var(--paper); border: 1px solid var(--line); padding: 7px 12px; border-radius: 4px; cursor: pointer; }
    .btn.gold { background: var(--gold); color: #1a1408; border-color: var(--gold); font-weight: 600; }
    .btn:disabled { opacity: 0.4; cursor: not-allowed; }
    #info { white-space: pre-wrap; color: var(--mute); flex: 1; min-height: 72px; overflow: auto; }
    .err { color: var(--bad); }
    .hint { color: var(--mute); font-size: 12px; }
    #brushmeta { margin-top: 6px; }
    #stage.busy::after {
      content: "Rendering map…";
      position: absolute; inset: 0;
      display: flex; align-items: center; justify-content: center;
      background: rgba(8,11,15,0.45); color: var(--paper);
      letter-spacing: 0.08em; font-size: 12px; pointer-events: none;
    }
    .diag-group { margin-bottom: 8px; }
    .diag-head { cursor: pointer; }
    .diag-head:hover { color: var(--paper); }
    .diag-body { display: none; padding: 4px 0 0 8px; }
    .diag-group.open .diag-body { display: block; }
    .diag-sample { cursor: pointer; color: var(--mute); }
    .diag-sample:hover { color: var(--paper); }
    @media (max-width: 860px) {
      #app { grid-template-columns: 1fr; grid-template-rows: 48px auto minmax(220px, 1fr) auto auto; }
      aside, .inspector { border: 0; border-bottom: 1px solid var(--line); max-height: 180px; }
      footer { flex-wrap: wrap; height: auto; padding: 8px 12px; }
    }
  </style>
</head>
<body>
  <div id="app">
    <header>
      <div class="mark">MAPIT</div>
      <div class="meta" id="mapmeta">loading…</div>
      <div class="badge" id="diag">—</div>
      <div class="meta" id="pendingmeta"></div>
    </header>
    <aside>
      <h2>Brush</h2>
      <label>Layer</label>
      <select id="layer">
        <option value="owner">owner</option>
        <option value="controller">controller</option>
        <option value="core">core</option>
        <option value="claim">claim</option>
      </select>
      <label>Search</label>
      <input id="brushq" type="search" placeholder="search all tags" autocomplete="off"/>
      <div id="brushmeta" class="hint"></div>
      <div id="brushes"></div>
    </aside>
    <div id="stage">
      <canvas id="map"></canvas>
      <div id="hud">
        <button class="btn" id="zoomout" type="button">−</button>
        <span id="zoomlabel">100%</span>
        <button class="btn" id="zoomin" type="button">+</button>
        <button class="btn" id="fit" type="button">Fit</button>
      </div>
    </div>
    <div class="inspector">
      <h2>Province</h2>
      <div id="info">Scroll to zoom, drag with middle mouse or Space to pan, left-drag to paint.</div>
      <h2 style="margin-top:18px">Diagnostics</h2>
      <div id="errors"></div>
    </div>
    <footer>
      <button class="btn" id="undo">Undo</button>
      <button class="btn" id="discard">Discard</button>
      <button class="btn gold" id="apply">Apply to mod</button>
      <button class="btn" id="atlas">Download atlas.json</button>
      <span class="hint" id="status">Wheel zoom · MMB / Space pan · Shift-click inspect · / search · A apply · U undo</span>
    </footer>
  </div>
  <script>
    const canvas = document.getElementById('map');
    const ctx = canvas.getContext('2d');
    const state = {
      meta: null, img: null, imgctx: null, imageData: null, rgba: null, ids: null, index: null,
      previewW: 0, previewH: 0, brush: null, painting: false, panning: false, space: false,
      lastId: 0, lastHit: 0, busy: false, camInit: false,
      cam: { zoom: 1, panX: 0, panY: 0 },
      panFrom: null, hoverTimer: 0, provinceCache: new Map()
    };
    let chain = Promise.resolve();
    function serial(fn) {
      const p = chain.then(fn, fn);
      chain = p.then(() => {}, () => {});
      return p;
    }
    function setBusy(on) {
      state.busy = on;
      document.getElementById('apply').disabled = on;
      document.getElementById('undo').disabled = on;
      document.getElementById('discard').disabled = on;
      document.getElementById('stage').classList.toggle('busy', on);
    }
    function fitZoom() {
      if (!state.img) return 1;
      return Math.min(canvas.width / state.img.width, canvas.height / state.img.height);
    }
    function fit() {
      if (!state.img) return;
      const z = fitZoom();
      state.cam.zoom = z;
      state.cam.panX = (canvas.width - state.img.width * z) / 2;
      state.cam.panY = (canvas.height - state.img.height * z) / 2;
      draw();
    }
    function zoomBy(factor, cx, cy) {
      if (!state.img) return;
      const old = state.cam.zoom;
      const min = fitZoom() * 0.5;
      const max = 32;
      const nx = Math.max(min, Math.min(max, old * factor));
      if (nx === old) return;
      const px = cx - (cx - state.cam.panX) * (nx / old);
      const py = cy - (cy - state.cam.panY) * (nx / old);
      state.cam.zoom = nx;
      state.cam.panX = px;
      state.cam.panY = py;
      draw();
    }
    function setCursor() {
      canvas.style.cursor = state.panning || state.space ? (state.panning ? 'grabbing' : 'grab') : 'crosshair';
    }
    async function json(url, opts) {
      const r = await fetch(url, opts);
      if (!r.ok) {
        const text = await r.text();
        const err = new Error(text);
        err.status = r.status;
        throw err;
      }
      return r.json();
    }
    function buildIndex(ids) {
      const counts = new Map();
      for (let i = 0; i < ids.length; i++) counts.set(ids[i], (counts.get(ids[i]) || 0) + 1);
      const index = new Map();
      const cursor = new Map();
      for (const [id, n] of counts) {
        index.set(id, new Uint32Array(n));
        cursor.set(id, 0);
      }
      for (let i = 0; i < ids.length; i++) {
        const id = ids[i];
        const arr = index.get(id);
        const k = cursor.get(id);
        arr[k] = i;
        cursor.set(id, k + 1);
      }
      return index;
    }
    function idAtMap(mx, mz) {
      if (!state.ids || !state.meta) return 0;
      const x = Math.min(state.previewW - 1, Math.max(0, Math.floor((mx * state.previewW) / state.meta.width)));
      const y = Math.min(state.previewH - 1, Math.max(0, Math.floor(((state.meta.height - 1 - mz) * state.previewH) / state.meta.height)));
      return state.ids[y * state.previewW + x] || 0;
    }
    function recolorProvince(id, rgb) {
      if (!state.rgba || !state.imgctx || !state.index || !state.ids || !state.imageData) return;
      const pixels = state.index.get(id);
      if (!pixels) return;
      const w = state.previewW, h = state.previewH, ids = state.ids, d = state.rgba;
      let minX = w, minY = h, maxX = 0, maxY = 0, any = false;
      for (let n = 0; n < pixels.length; n++) {
        const i = pixels[n];
        const x = i % w, y = (i / w) | 0;
        const left = x === 0 ? ids[i + w - 1] : ids[i - 1];
        const right = x === w - 1 ? ids[i - w + 1] : ids[i + 1];
        if (left !== id || right !== id) continue;
        if (y > 0 && ids[i - w] !== id) continue;
        if (y < h - 1 && ids[i + w] !== id) continue;
        const o = i * 4;
        d[o] = rgb[0]; d[o + 1] = rgb[1]; d[o + 2] = rgb[2];
        any = true;
        if (x < minX) minX = x;
        if (y < minY) minY = y;
        if (x > maxX) maxX = x;
        if (y > maxY) maxY = y;
      }
      if (!any) return;
      state.imgctx.putImageData(state.imageData, 0, 0, minX, minY, maxX - minX + 1, maxY - minY + 1);
      draw();
    }
    async function loadPreview() {
      const res = await fetch('/api/preview.bin');
      if (!res.ok) throw new Error(await res.text());
      const buf = await res.arrayBuffer();
      const view = new DataView(buf);
      if (view.getUint32(0, false) !== 0x4d504954) throw new Error('bad preview magic');
      if (view.getUint32(4, true) !== 1) throw new Error('bad preview version');
      const width = view.getUint32(8, true);
      const height = view.getUint32(12, true);
      const rgbLen = width * height * 3;
      const rgb = new Uint8Array(buf, 16, rgbLen);
      const idOffset = 16 + rgbLen;
      const ids = idOffset % 4 === 0
        ? new Uint32Array(buf, idOffset, width * height)
        : new Uint32Array(buf.slice(idOffset));
      const rgba = new Uint8ClampedArray(width * height * 4);
      for (let i = 0, j = 0; i < rgb.length; i += 3, j += 4) {
        rgba[j] = rgb[i]; rgba[j + 1] = rgb[i + 1]; rgba[j + 2] = rgb[i + 2]; rgba[j + 3] = 255;
      }
      const off = document.createElement('canvas');
      off.width = width;
      off.height = height;
      const offctx = off.getContext('2d');
      const imageData = new ImageData(rgba, width, height);
      offctx.putImageData(imageData, 0, 0);
      state.img = off;
      state.imgctx = offctx;
      state.rgba = rgba;
      state.imageData = imageData;
      state.ids = ids;
      state.previewW = width;
      state.previewH = height;
      state.index = buildIndex(ids);
      state.provinceCache = new Map();
    }
    function renderBrushes() {
      if (!state.meta) return;
      const q = (document.getElementById('brushq').value || '').trim().toLowerCase();
      const box = document.getElementById('brushes');
      const scroll = box.scrollTop;
      const rows = state.meta.countries.filter((c) => {
        const match = !q || c.tag.toLowerCase().includes(q) || (c.name && c.name.toLowerCase().includes(q));
        if (!match) return false;
        if (!q && c.onMap === false) return false;
        return true;
      });
      box.innerHTML = '';
      for (const c of rows) {
        const el = document.createElement('div');
        el.className = 'brush' + (state.brush === c.tag ? ' on' : '');
        el.innerHTML = '<span class="swatch" style="background:rgb(' + c.color.join(',') + ')"></span>' +
          c.tag + (c.name && c.name !== c.tag ? ' ' + c.name : '');
        el.onclick = () => {
          state.brush = c.tag;
          for (const n of box.querySelectorAll('.brush')) n.classList.toggle('on', n === el);
        };
        box.appendChild(el);
      }
      if (!state.brush && rows[0]) {
        state.brush = rows[0].tag;
        const first = box.querySelector('.brush');
        if (first) first.classList.add('on');
      }
      box.scrollTop = scroll;
      const onMap = (state.meta.countries || []).filter((c) => c.onMap !== false).length;
      document.getElementById('brushmeta').textContent = q
        ? rows.length + ' matches'
        : onMap + ' on map · type to search the rest';
    }
    function applyMeta(meta) {
      state.meta = meta;
      document.getElementById('mapmeta').textContent =
        meta.width + '×' + meta.height + ' · ' + meta.provinces + ' provinces · ' +
        meta.states + ' states';
      const d = meta.diagnostics;
      const badge = document.getElementById('diag');
      badge.textContent = d.errors + ' errors / ' + d.warnings + ' warnings';
      badge.className = 'badge ' + (d.errors ? 'bad' : 'ok');
      document.getElementById('pendingmeta').textContent = meta.pending + ' pending';
      const groups = d.groups || [];
      let html = '';
      if (groups.length) {
        html = groups.map((g) => {
          const samples = (g.samples || []).map((s) => {
            const label = s.province
              ? 'province ' + s.province
              : (s.x !== undefined ? s.x + ',' + s.z : (s.message || g.message));
            return '<div class="diag-sample" data-province="' + (s.province || '') +
              '" data-x="' + (s.x ?? '') + '" data-z="' + (s.z ?? '') + '">' + label + '</div>';
          }).join('');
          return '<div class="diag-group' + (g.severity === 'error' ? ' err' : '') + '">' +
            '<div class="diag-head">' + g.code + ' × ' + g.count +
            (g.count === 1 ? ' — ' + g.message : '') + '</div>' +
            '<div class="diag-body">' + samples + '</div></div>';
        }).join('');
      } else {
        const errs = d.sampleErrors || (d.sample || []).filter((e) => e.severity === 'error');
        const warns = d.sampleWarnings || (d.sample || []).filter((e) => e.severity !== 'error');
        const line = (e) => '<div class="' + (e.severity === 'error' ? 'err' : '') + '">' + e.code + ': ' + e.message + '</div>';
        html = errs.map(line).join('') + warns.map(line).join('');
      }
      document.getElementById('errors').innerHTML = html;
      renderBrushes();
    }
    async function refreshMeta() {
      applyMeta(await json('/api/meta'));
    }
    async function reload(full) {
      if (full === undefined) full = !state.img;
      setBusy(true);
      try {
        await refreshMeta();
        if (full) {
          await loadPreview();
          layout();
        }
        if (state.lastHit) await showProvince(state.lastHit);
      } finally {
        if (!state.painting) setBusy(false);
      }
    }
    function layout() {
      const stage = document.getElementById('stage');
      const oldW = canvas.width, oldH = canvas.height;
      canvas.width = stage.clientWidth;
      canvas.height = stage.clientHeight;
      if (!state.img) return;
      if (!state.camInit) {
        fit();
        state.camInit = true;
      } else {
        state.cam.panX += (canvas.width - oldW) / 2;
        state.cam.panY += (canvas.height - oldH) / 2;
        draw();
      }
    }
    function mapPoint(ev) {
      if (!state.img || !state.meta) return null;
      const r = canvas.getBoundingClientRect();
      const x = (ev.clientX - r.left - state.cam.panX) / state.cam.zoom;
      const y = (ev.clientY - r.top - state.cam.panY) / state.cam.zoom;
      if (x < 0 || y < 0 || x >= state.img.width || y >= state.img.height) return null;
      const mx = Math.min(state.meta.width - 1, Math.floor((x * state.meta.width) / state.img.width));
      const mz = state.meta.height - 1 - Math.min(state.meta.height - 1, Math.floor((y * state.meta.height) / state.img.height));
      return { x: mx, z: mz };
    }
    function draw() {
      ctx.fillStyle = '#080b0f';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      if (!state.img) return;
      ctx.imageSmoothingEnabled = state.cam.zoom < 1.5;
      ctx.drawImage(state.img, state.cam.panX, state.cam.panY, state.img.width * state.cam.zoom, state.img.height * state.cam.zoom);
      const fitZ = fitZoom();
      document.getElementById('zoomlabel').textContent = Math.round((state.cam.zoom / fitZ) * 100) + '%';
    }
    function zoomToMap(mx, mz, factor) {
      if (!state.img || !state.meta) return;
      const ix = (mx / state.meta.width) * state.img.width;
      const iy = ((state.meta.height - 1 - mz) / state.meta.height) * state.img.height;
      const z = Math.min(32, Math.max(fitZoom() * (factor || 8), fitZoom() * 4));
      state.cam.zoom = z;
      state.cam.panX = canvas.width / 2 - ix * z;
      state.cam.panY = canvas.height / 2 - iy * z;
      draw();
    }
    async function jumpToProvince(id, x, z) {
      if (id) {
        try {
          const p = await json('/api/province/' + id);
          showPayload(p);
          if (p.centroid) zoomToMap(p.centroid.x, p.centroid.z, 10);
          return;
        } catch (e) {
          if (e.status !== 404) throw e;
        }
      }
      if (x !== '' && z !== '' && x !== undefined && z !== undefined) zoomToMap(Number(x), Number(z), 10);
    }
    function showPayload(p) {
      if (!p) return;
      state.lastHit = p.id;
      document.getElementById('info').textContent =
        'Province ' + p.id + '\\n' + p.type + (p.coastal ? ' coastal' : '') +
        '\\nowner ' + (p.owner || '—') + (p.pending ? ' (pending)' : '') +
        '\\ncontroller ' + (p.controller || '—') +
        '\\ncores ' + ((p.cores && p.cores.length) ? p.cores.join(', ') : '—') +
        '\\nclaims ' + ((p.claims && p.claims.length) ? p.claims.join(', ') : '—') +
        '\\nstate ' + (p.stateName || p.state || '—') +
        '\\nterrain ' + p.terrain + (p.vp ? '\\nVP ' + p.vp : '') +
        '\\nneighbors ' + (p.neighbors || []).join(', ');
    }
    async function showProvince(id) {
      if (!id) return;
      const cached = state.provinceCache.get(id);
      if (cached) {
        showPayload(cached);
        return;
      }
      try {
        const p = await json('/api/province/' + id);
        state.provinceCache.set(id, p);
        showPayload(p);
      } catch (e) {
        if (e.status !== 404) throw e;
      }
    }
    async function paintAt(mx, mz) {
      if (!state.brush) return;
      const id = idAtMap(mx, mz);
      if (!id || id === state.lastId) {
        if (id) await showProvince(id);
        return;
      }
      const cached = state.provinceCache.get(id);
      if (cached && cached.type !== 'land') {
        state.lastId = id;
        showPayload(cached);
        return;
      }
      const layer = document.getElementById('layer').value;
      const r = await json('/api/paint', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ layer: layer, brush: state.brush, provinces: [id] })
      });
      state.lastId = id;
      if (r.province) {
        state.provinceCache.set(id, r.province);
        showPayload(r.province);
      } else {
        await showProvince(id);
      }
      if (r.painted && r.painted.length && layer === 'owner') {
        const country = (state.meta.countries || []).find((c) => c.tag === state.brush);
        if (country) recolorProvince(id, country.color);
      }
    }
    function hoverAt(ev) {
      const pt = mapPoint(ev);
      if (!pt) return;
      const id = idAtMap(pt.x, pt.z);
      if (!id) return;
      const cached = state.provinceCache.get(id);
      if (cached) {
        if (!state.painting) showPayload(cached);
        return;
      }
      clearTimeout(state.hoverTimer);
      state.hoverTimer = setTimeout(() => {
        serial(async () => {
          if (state.painting) return;
          await showProvince(id);
        });
      }, 40);
    }
    canvas.addEventListener('contextmenu', (ev) => ev.preventDefault());
    canvas.addEventListener('mousedown', (ev) => {
      if (state.busy) return;
      if (ev.shiftKey && ev.button === 0) {
        const pt = mapPoint(ev);
        if (pt) serial(() => showProvince(idAtMap(pt.x, pt.z)));
        ev.preventDefault();
        return;
      }
      if (ev.button === 1 || ev.button === 2 || state.space || ev.altKey) {
        state.panning = true;
        state.panFrom = { x: ev.clientX, y: ev.clientY, panX: state.cam.panX, panY: state.cam.panY };
        setCursor();
        ev.preventDefault();
        return;
      }
      if (ev.button !== 0) return;
      const pt = mapPoint(ev);
      if (!pt) return;
      state.painting = true;
      state.lastId = 0;
      serial(() => paintAt(pt.x, pt.z));
    });
    canvas.addEventListener('mousemove', (ev) => {
      if (state.panning && state.panFrom) {
        state.cam.panX = state.panFrom.panX + (ev.clientX - state.panFrom.x);
        state.cam.panY = state.panFrom.panY + (ev.clientY - state.panFrom.y);
        draw();
        return;
      }
      if (state.painting) {
        const pt = mapPoint(ev);
        if (pt) serial(() => paintAt(pt.x, pt.z));
        return;
      }
      hoverAt(ev);
    });
    window.addEventListener('mouseup', () => {
      if (state.panning) {
        state.panning = false;
        state.panFrom = null;
        setCursor();
        return;
      }
      if (!state.painting) return;
      state.painting = false;
      serial(() => refreshMeta());
    });
    canvas.addEventListener('wheel', (ev) => {
      ev.preventDefault();
      const r = canvas.getBoundingClientRect();
      const factor = ev.deltaY < 0 ? 1.18 : 1 / 1.18;
      zoomBy(factor, ev.clientX - r.left, ev.clientY - r.top);
    }, { passive: false });
    canvas.addEventListener('dblclick', (ev) => {
      const r = canvas.getBoundingClientRect();
      zoomBy(1.8, ev.clientX - r.left, ev.clientY - r.top);
    });
    document.getElementById('errors').addEventListener('click', (ev) => {
      const sample = ev.target.closest('.diag-sample');
      if (sample) {
        serial(() => jumpToProvince(sample.dataset.province, sample.dataset.x, sample.dataset.z));
        return;
      }
      const head = ev.target.closest('.diag-head');
      if (head) head.parentElement.classList.toggle('open');
    });
    document.getElementById('zoomin').onclick = () => zoomBy(1.25, canvas.width / 2, canvas.height / 2);
    document.getElementById('zoomout').onclick = () => zoomBy(1 / 1.25, canvas.width / 2, canvas.height / 2);
    document.getElementById('fit').onclick = () => fit();
    document.getElementById('brushq').addEventListener('input', renderBrushes);
    document.getElementById('undo').onclick = () => serial(async () => { await json('/api/undo', { method: 'POST' }); await reload(true); });
    document.getElementById('discard').onclick = () => serial(async () => { await json('/api/discard', { method: 'POST' }); await reload(true); });
    document.getElementById('apply').onclick = () => serial(async () => {
      const r = await json('/api/apply', { method: 'POST' });
      document.getElementById('status').textContent = 'Wrote ' + r.wrote.length + ' files, new states ' + r.createdStates;
      await reload(true);
    });
    document.getElementById('atlas').onclick = () => {
      const a = document.createElement('a');
      a.href = '/api/atlas.json';
      a.download = 'atlas.json';
      document.body.appendChild(a);
      a.click();
      a.remove();
    };
    window.addEventListener('keydown', (ev) => {
      if (ev.key === '/' && !ev.metaKey && !ev.ctrlKey && !ev.altKey) {
        const tag = (ev.target && ev.target.tagName) || '';
        if (tag !== 'INPUT' && tag !== 'TEXTAREA') {
          ev.preventDefault();
          document.getElementById('brushq').focus();
          document.getElementById('brushq').select();
          return;
        }
      }
      if (ev.key === 'Escape') {
        const q = document.getElementById('brushq');
        q.value = '';
        renderBrushes();
        q.blur();
        return;
      }
      if (ev.code === 'Space') {
        if (!state.space) { state.space = true; setCursor(); }
        if (ev.target === document.body || ev.target === canvas) ev.preventDefault();
        return;
      }
      if (state.busy || ev.metaKey || ev.ctrlKey || ev.altKey) return;
      const tag = (ev.target && ev.target.tagName) || '';
      if (tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA') return;
      if (ev.key === 'ArrowLeft') { state.cam.panX += 60; draw(); ev.preventDefault(); }
      if (ev.key === 'ArrowRight') { state.cam.panX -= 60; draw(); ev.preventDefault(); }
      if (ev.key === 'ArrowUp') { state.cam.panY += 60; draw(); ev.preventDefault(); }
      if (ev.key === 'ArrowDown') { state.cam.panY -= 60; draw(); ev.preventDefault(); }
      if (ev.key === 'a' || ev.key === 'A') document.getElementById('apply').click();
      if (ev.key === 'u' || ev.key === 'U') document.getElementById('undo').click();
      if (ev.key === '0' || ev.key === 'f' || ev.key === 'F') fit();
      if (ev.key === '+' || ev.key === '=') zoomBy(1.25, canvas.width / 2, canvas.height / 2);
      if (ev.key === '-' || ev.key === '_') zoomBy(1 / 1.25, canvas.width / 2, canvas.height / 2);
    });
    window.addEventListener('keyup', (ev) => {
      if (ev.code === 'Space') { state.space = false; setCursor(); }
    });
    window.addEventListener('resize', layout);
    reload().catch((e) => { document.getElementById('info').textContent = e.message; });
  </script>
</body>
</html>
`;
