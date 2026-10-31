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
    aside, .inspector { background: var(--panel); border-right: 1px solid var(--line); overflow: auto; padding: 12px; }
    .inspector { border-right: 0; border-left: 1px solid var(--line); }
    #stage { position: relative; overflow: hidden; background: #080b0f; }
    canvas { image-rendering: pixelated; cursor: crosshair; display: block; }
    h2 { margin: 0 0 8px; font-size: 11px; letter-spacing: 0.12em; text-transform: uppercase; color: var(--gold); font-weight: 600; }
    .brush { display: flex; align-items: center; gap: 8px; padding: 5px 6px; border-radius: 4px; cursor: pointer; }
    .brush.on { background: #1d2733; outline: 1px solid var(--gold); }
    .swatch { width: 12px; height: 12px; border-radius: 2px; }
    label { display: block; color: var(--mute); margin: 8px 0 4px; }
    select, input { width: 100%; background: #0c1016; color: var(--paper); border: 1px solid var(--line); padding: 6px 8px; border-radius: 4px; }
    footer { grid-column: 1 / -1; display: flex; align-items: center; gap: 10px; padding: 0 16px; border-top: 1px solid var(--line); background: #10161d; }
    .btn { background: #1b232e; color: var(--paper); border: 1px solid var(--line); padding: 7px 12px; border-radius: 4px; cursor: pointer; }
    .btn.gold { background: var(--gold); color: #1a1408; border-color: var(--gold); font-weight: 600; }
    .btn:disabled { opacity: 0.4; cursor: not-allowed; }
    #info { white-space: pre-wrap; color: var(--mute); }
    .err { color: var(--bad); }
    .hint { color: var(--mute); font-size: 12px; }
    @media (max-width: 860px) {
      #app { grid-template-columns: 1fr; grid-template-rows: 48px auto minmax(220px, 1fr) auto auto; }
      aside, .inspector { border: 0; border-bottom: 1px solid var(--line); max-height: 150px; }
      #brushes { display: flex; flex-wrap: wrap; gap: 4px; }
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
      <div id="brushes"></div>
    </aside>
    <div id="stage"><canvas id="map"></canvas></div>
    <div class="inspector">
      <h2>Province</h2>
      <div id="info">Click the map. Drag to paint.</div>
      <h2 style="margin-top:18px">Diagnostics</h2>
      <div id="errors"></div>
    </div>
    <footer>
      <button class="btn" id="undo">Undo</button>
      <button class="btn" id="discard">Discard</button>
      <button class="btn gold" id="apply">Apply to mod</button>
      <button class="btn" id="atlas">Download atlas.json</button>
      <span class="hint">Pending paints split mixed states on Apply. A apply · U undo · drag to paint.</span>
    </footer>
  </div>
  <script>
    const canvas = document.getElementById('map');
    const ctx = canvas.getContext('2d');
    const state = { meta: null, img: null, ids: null, idW: 0, idH: 0, brush: null, painting: false, lastId: 0, lastHit: 0 };
    async function json(url, opts) {
      const r = await fetch(url, opts);
      if (!r.ok) throw new Error(await r.text());
      return r.json();
    }
    async function reload() {
      state.meta = await json('/api/meta');
      document.getElementById('mapmeta').textContent =
        state.meta.width + '×' + state.meta.height + ' · ' + state.meta.provinces + ' provinces · ' +
        state.meta.states + ' states';
      const d = state.meta.diagnostics;
      const badge = document.getElementById('diag');
      badge.textContent = d.errors + ' errors / ' + d.warnings + ' warnings';
      badge.className = 'badge ' + (d.errors ? 'bad' : 'ok');
      document.getElementById('pendingmeta').textContent = state.meta.pending + ' pending';
      document.getElementById('errors').innerHTML = (d.sample || []).map(e =>
        '<div class="' + (e.severity === 'error' ? 'err' : '') + '">' + e.code + ': ' + e.message + '</div>'
      ).join('');
      if (!state.brush && state.meta.countries[0]) state.brush = state.meta.countries[0].tag;
      const box = document.getElementById('brushes');
      box.innerHTML = '';
      for (const c of state.meta.countries) {
        const el = document.createElement('div');
        el.className = 'brush' + (state.brush === c.tag ? ' on' : '');
        el.innerHTML = '<span class="swatch" style="background:rgb(' + c.color.join(',') + ')"></span>' +
          c.tag + (c.name && c.name !== c.tag ? ' ' + c.name : '');
        el.onclick = () => { state.brush = c.tag; reload(); };
        box.appendChild(el);
      }
      const img = new Image();
      img.src = '/api/preview.png?' + Date.now();
      await img.decode();
      state.img = img;
      const idImg = await fetch('/api/idmap.png?' + Date.now()).then(r => r.blob()).then(createImageBitmap);
      const off = document.createElement('canvas');
      off.width = idImg.width; off.height = idImg.height;
      const ictx = off.getContext('2d');
      ictx.drawImage(idImg, 0, 0);
      const pix = ictx.getImageData(0, 0, off.width, off.height).data;
      const ids = new Uint32Array(off.width * off.height);
      for (let i = 0; i < ids.length; i++) ids[i] = (pix[i*4] << 16) | (pix[i*4+1] << 8) | pix[i*4+2];
      state.ids = ids; state.idW = off.width; state.idH = off.height;
      layout();
      if (state.lastHit) await hit(state.lastHit);
    }
    function layout() {
      const stage = document.getElementById('stage');
      canvas.width = stage.clientWidth;
      canvas.height = stage.clientHeight;
      draw();
    }
    function mapPoint(ev) {
      if (!state.img) return null;
      const r = canvas.getBoundingClientRect();
      const scale = Math.min(canvas.width / state.img.width, canvas.height / state.img.height);
      const ox = (canvas.width - state.img.width * scale) / 2;
      const oy = (canvas.height - state.img.height * scale) / 2;
      const x = Math.floor((ev.clientX - r.left - ox) / scale);
      const y = Math.floor((ev.clientY - r.top - oy) / scale);
      if (x < 0 || y < 0 || x >= state.idW || y >= state.idH) return null;
      return { x, y, id: state.ids[y * state.idW + x] };
    }
    function draw() {
      ctx.fillStyle = '#080b0f';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      if (!state.img) return;
      const scale = Math.min(canvas.width / state.img.width, canvas.height / state.img.height);
      const w = state.img.width * scale, h = state.img.height * scale;
      ctx.drawImage(state.img, (canvas.width - w) / 2, (canvas.height - h) / 2, w, h);
    }
    async function hit(id) {
      if (!id) return;
      state.lastHit = id;
      const p = await json('/api/province/' + id);
      document.getElementById('info').textContent =
        'Province ' + p.id + '\\n' + p.type + (p.coastal ? ' coastal' : '') +
        '\\nowner ' + (p.owner || '—') + '\\nstate ' + (p.stateName || p.state || '—') +
        '\\nterrain ' + p.terrain + (p.vp ? '\\nVP ' + p.vp : '') +
        '\\nneighbors ' + (p.neighbors || []).join(', ');
    }
    async function paintAt(id) {
      if (!id || !state.brush || id === state.lastId) return;
      state.lastId = id;
      await json('/api/paint', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ layer: document.getElementById('layer').value, brush: state.brush, provinces: [id] })
      });
    }
    canvas.addEventListener('mousedown', async (ev) => {
      const pt = mapPoint(ev);
      if (!pt) return;
      state.painting = true;
      state.lastId = 0;
      await hit(pt.id);
      await paintAt(pt.id);
    });
    canvas.addEventListener('mousemove', async (ev) => {
      const pt = mapPoint(ev);
      if (!pt) return;
      if (state.painting) await paintAt(pt.id);
    });
    window.addEventListener('mouseup', async () => {
      if (state.painting) { state.painting = false; await reload(); }
    });
    document.getElementById('undo').onclick = async () => { await json('/api/undo', { method: 'POST' }); await reload(); };
    document.getElementById('discard').onclick = async () => { await json('/api/discard', { method: 'POST' }); await reload(); };
    document.getElementById('apply').onclick = async () => {
      const r = await json('/api/apply', { method: 'POST' });
      alert('Wrote ' + r.wrote.length + ' files, new states ' + r.createdStates);
      await reload();
    };
    document.getElementById('atlas').onclick = () => { location.href = '/api/atlas.json'; };
    window.addEventListener('keydown', (ev) => {
      if (ev.key === 'a') document.getElementById('apply').click();
      if (ev.key === 'u') document.getElementById('undo').click();
    });
    window.addEventListener('resize', layout);
    reload().catch((e) => { document.getElementById('info').textContent = e.message; });
  </script>
</body>
</html>
`;
