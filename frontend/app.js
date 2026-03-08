/* ═══════════════════════════════════════════════════
   StampedeSafe — app.js  v2.0
   • Animated canvas grid
   • Single + Multi camera API calls
   • Heatmap base64 rendering
   • Risk timeline Chart.js
   • Score breakdown bars
   • ADDED: Live WebSocket Streaming
   • ADDED: Per-Camera Manual Video Uploads
═══════════════════════════════════════════════════ */

const state = { singleFile: null, multiFiles: [] };
let chartInstances = {};   // track Chart.js instances to destroy on re-render

// ── INIT ────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  initGrid();
  initClock();
  initDragDrop();
  // --- ADDED FOR LIVE DEMO ---
  // Only init live stream if we are NOT on the dashboard (which has its own logic)
  if (!document.getElementById('connPill')) {
    initLiveStream();
  }
});

// ── CLOCK ────────────────────────────────────────────
function initClock() {
  const tick = () => {
    const n = new Date();
    document.getElementById('clock').textContent = n.toLocaleTimeString('en-GB', { hour12: false });
    document.getElementById('clockDate').textContent =
      n.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }).toUpperCase();
  };
  tick();
  setInterval(tick, 1000);
}

// ── ANIMATED GRID CANVAS ─────────────────────────────
function initGrid() {
  const canvas = document.getElementById('gridCanvas');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  let w, h, particles = [];

  const resize = () => {
    if (!canvas) return;
    w = canvas.width = window.innerWidth;
    h = canvas.height = window.innerHeight;
  };

  class Particle {
    constructor() { this.reset(); }
    reset() {
      this.x = Math.random() * w;
      this.y = Math.random() * h;
      this.vx = (Math.random() - 0.5) * 0.3;
      this.vy = (Math.random() - 0.5) * 0.3;
      this.a = Math.random() * 0.4 + 0.1;
      this.r = Math.random() * 1.5 + 0.5;
    }
    update() {
      this.x += this.vx; this.y += this.vy;
      if (this.x < 0 || this.x > w || this.y < 0 || this.y > h) this.reset();
    }
    draw() {
      ctx.beginPath();
      ctx.arc(this.x, this.y, this.r, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(0,245,212,${this.a})`;
      ctx.fill();
    }
  }

  resize();
  window.addEventListener('resize', () => { resize(); particles = []; spawn(); });

  const spawn = () => {
    const n = Math.floor((w * h) / 18000);
    for (let i = 0; i < n; i++) particles.push(new Particle());
  };
  spawn();

  const loop = () => {
    ctx.clearRect(0, 0, w, h);

    // Grid lines
    ctx.strokeStyle = 'rgba(0,245,212,0.06)';
    ctx.lineWidth = 0.5;
    for (let x = 0; x < w; x += 60) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, h); ctx.stroke(); }
    for (let y = 0; y < h; y += 60) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke(); }

    // Particles + connections
    particles.forEach(p => { p.update(); p.draw(); });
    for (let i = 0; i < particles.length; i++)
      for (let j = i + 1; j < particles.length; j++) {
        const dx = particles[i].x - particles[j].x;
        const dy = particles[i].y - particles[j].y;
        const d = Math.sqrt(dx * dx + dy * dy);
        if (d < 120) {
          ctx.beginPath();
          ctx.moveTo(particles[i].x, particles[i].y);
          ctx.lineTo(particles[j].x, particles[j].y);
          ctx.strokeStyle = `rgba(0,245,212,${0.08 * (1 - d / 120)})`;
          ctx.lineWidth = 0.5;
          ctx.stroke();
        }
      }
    requestAnimationFrame(loop);
  };
  loop();
}

// ── MODE SWITCH ──────────────────────────────────────
function switchMode(mode, btn) {
  document.querySelectorAll('.nav-tab').forEach(t => t.classList.remove('active'));
  btn.classList.add('active');
  document.getElementById('mode-single').classList.toggle('hidden', mode !== 'single');
  document.getElementById('mode-multi').classList.toggle('hidden', mode !== 'multi');
}

// ── DRAG & DROP ──────────────────────────────────────
function initDragDrop() {
  setupDrop('singleDrop', false);
  setupDrop('multiDrop', true);
}

function setupDrop(id, multi) {
  const z = document.getElementById(id);
  if (!z) return;
  z.addEventListener('dragover', e => { e.preventDefault(); z.classList.add('dragover'); });
  z.addEventListener('dragleave', () => z.classList.remove('dragover'));
  z.addEventListener('drop', e => {
    e.preventDefault(); z.classList.remove('dragover');
    const files = [...e.dataTransfer.files].filter(f => f.type.startsWith('video/'));
    if (!files.length) return;
    if (multi) { state.multiFiles = [...state.multiFiles, ...files].slice(0, 8); renderChips(); }
    else { state.singleFile = files[0]; renderSinglePreview(); }
  });
}

// ── FILE HANDLERS ────────────────────────────────────
function handleSingle(input) {
  if (input.files[0]) { state.singleFile = input.files[0]; renderSinglePreview(); }
}

function renderSinglePreview() {
  const f = state.singleFile;
  document.getElementById('singlePreview').innerHTML = f
    ? `<div class="file-preview-chip">📹 <span>${f.name}</span> <span style="color:var(--text-dim)">${(f.size / 1024 / 1024).toFixed(1)} MB</span></div>`
    : '';
  document.getElementById('singleBtn').disabled = !f;
}

function handleMulti(input) {
  state.multiFiles = [...state.multiFiles, ...[...input.files]].slice(0, 8);
  renderChips();
}

function renderChips() {
  document.getElementById('multiChips').innerHTML = state.multiFiles.map((f, i) => `
    <div class="file-chip">
      <span class="chip-cam">CAM-B${i + 1}</span>
      <span>${f.name.length > 22 ? f.name.slice(0, 20) + '…' : f.name}</span>
      <span style="color:var(--text-dim)">${(f.size / 1024 / 1024).toFixed(1)}MB</span>
      <button class="chip-remove" onclick="removeChip(${i},event)">✕</button>
    </div>`).join('');
  document.getElementById('multiBtn').disabled = state.multiFiles.length === 0;
  const b = document.getElementById('camCount');
  b.style.display = state.multiFiles.length ? 'block' : 'none';
  document.getElementById('camNum').textContent = state.multiFiles.length;
}

function removeChip(i, e) {
  e.stopPropagation();
  state.multiFiles.splice(i, 1);
  renderChips();
}

// ── CONNECTION TEST ───────────────────────────────────
async function testConnection() {
  const url = getBase();
  const pill = document.getElementById('connPill');
  const resp = document.getElementById('configResp');
  document.getElementById('testBtnTxt').textContent = '...';
  pill.className = 'status-pill';
  pill.querySelector('.pill-text').textContent = 'TESTING';
  resp.style.color = 'var(--text-dim)';
  resp.textContent = 'pinging…';
  try {
    const t = Date.now();
    const res = await fetch(url + '/', { signal: AbortSignal.timeout(5000) });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const ms = Date.now() - t;
    pill.className = 'status-pill online';
    pill.querySelector('.pill-text').textContent = 'ONLINE';
    resp.style.color = 'var(--green)';
    resp.textContent = `✓ Connected · ${ms}ms`;
    document.getElementById('footerStatus').textContent = 'BACKEND CONNECTED';
  } catch (e) {
    pill.className = 'status-pill error';
    pill.querySelector('.pill-text').textContent = 'FAILED';
    resp.style.color = 'var(--red)';
    resp.textContent = '✗ ' + e.message;
  } finally {
    document.getElementById('testBtnTxt').textContent = 'PING';
  }
}

function getBase() {
  return "http://43.205.241.149:8000";
}
// ── ANALYZE SINGLE ────────────────────────────────────
async function analyzeSingle() {
  const url = getBase();
  const btn = document.getElementById('singleBtn');
  const errEl = document.getElementById('singleError');
  errEl.style.display = 'none';
  setLoading(btn, true, 'ANALYZING...');

  const fd = new FormData();
  fd.append('file', state.singleFile);

  try {
    const res = await fetch(url + '/analyze', { method: 'POST', body: fd });
    if (!res.ok) throw new Error(`Server returned ${res.status}`);
    const data = await res.json();
    renderSingleResult(data);
    document.getElementById('footerStatus').textContent = `ANALYSIS COMPLETE · RISK: ${data.risk_level?.toUpperCase()}`;
  } catch (e) {
    showErr(errEl, e.message);
  } finally {
    setLoading(btn, false, 'RUN ANALYSIS');
    btn.disabled = false;
  }
}

// ── ANALYZE SYSTEM ─────────────────────────────────────
async function analyzeSystem() {
  const url = getBase();
  const btn = document.getElementById('multiBtn');
  const errEl = document.getElementById('multiError');
  errEl.style.display = 'none';
  setLoading(btn, true, 'SCANNING...');

  const fd = new FormData();
  state.multiFiles.forEach(f => fd.append('files', f));

  try {
    const res = await fetch(url + '/analyze_system', { method: 'POST', body: fd });
    if (!res.ok) throw new Error(`Server returned ${res.status}`);
    const data = await res.json();
    renderSystemResult(data);
    document.getElementById('footerStatus').textContent = `SYSTEM SCAN DONE · STATUS: ${data.system_status}`;
  } catch (e) {
    showErr(errEl, e.message);
  } finally {
    setLoading(btn, false, 'ANALYZE SYSTEM');
    btn.disabled = false;
  }
}

// ── RENDER SINGLE RESULT ──────────────────────────────
function renderSingleResult(d) {
  const container = document.getElementById('singleResults');

  // Destroy old chart if exists
  if (chartInstances['single']) { chartInstances['single'].destroy(); }

  container.innerHTML = `
    <div class="results-wrapper">

      <div class="results-top-row">
        ${buildCard(d, 0)}
        ${buildScoreBreakdown(d)}
      </div>

      ${buildHeatmapPanel(d, 'CAM_01')}

      ${d.risk_timeline?.length ? buildChartPanel('single') : ''}

    </div>`;

  // Animate bars
  setTimeout(() => animateBars(container), 80);

  // Render chart
  if (d.risk_timeline?.length) {
    renderChart('riskChart_single', d.risk_timeline, d.risk_level);
  }
}

// ── RENDER SYSTEM RESULT ──────────────────────────────
function renderSystemResult(data) {
  const container = document.getElementById('multiResults');

  // Destroy all old charts
  Object.keys(chartInstances).forEach(k => {
    if (chartInstances[k]) chartInstances[k].destroy();
    delete chartInstances[k];
  });

  const statusIcon = { CRITICAL: '🚨', WARNING: '⚠️', STABLE: '✅' }[data.system_status] || '❓';
  const statColor = { CRITICAL: 'var(--red)', WARNING: 'var(--amber)', STABLE: 'var(--green)' }[data.system_status];

  container.innerHTML = `
    <div class="sys-banner ${data.system_status}">
      <div class="sys-banner-top">
        <span style="font-size:24px">${statusIcon}</span>
        <span class="sys-status-label">SYSTEM ${data.system_status}</span>
      </div>
      <div class="sys-stats">
        <div class="sys-stat"><span class="sys-stat-val" style="color:${statColor}">${data.total_persons}</span><span class="sys-stat-lbl">Total Persons</span></div>
        <div class="sys-stat"><span class="sys-stat-val" style="color:var(--red)">${data.high_risk_zones}</span><span class="sys-stat-lbl">High Risk Zones</span></div>
        <div class="sys-stat"><span class="sys-stat-val" style="color:var(--amber)">${data.medium_risk_zones}</span><span class="sys-stat-lbl">Medium Risk</span></div>
        <div class="sys-stat"><span class="sys-stat-val" style="color:var(--green)">${data.low_risk_zones}</span><span class="sys-stat-lbl">Low Risk</span></div>
        <div class="sys-stat"><span class="sys-stat-val" style="color:var(--red)">${data.active_incidents}</span><span class="sys-stat-lbl">Incidents</span></div>
        <div class="sys-stat"><span class="sys-stat-val" style="color:var(--amber)">${data.bottleneck_zones ?? 0}</span><span class="sys-stat-lbl">Bottlenecks</span></div>
        <div class="sys-stat"><span class="sys-stat-val">${data.average_risk_score ?? 0}</span><span class="sys-stat-lbl">Avg Risk Score</span></div>
      </div>
    </div>

    <div class="section-header" style="margin-top:0">
      <div class="section-title-block">
        <span class="section-tag">ZONES</span>
        <h2 class="section-title">CAMERA RESULTS</h2>
      </div>
      <span class="section-meta">${(data.zones || []).length} zones scanned</span>
    </div>

    <div class="results-wrapper">
      ${(data.zones || []).map((z, i) => `
        <div class="results-top-row" style="margin-bottom:32px; border-bottom:1px solid var(--border); padding-bottom:28px;">
          ${buildCard(z, i * 80)}
          ${buildScoreBreakdown(z)}
        </div>
        ${buildHeatmapPanel(z, z.camera_id)}
        ${z.risk_timeline?.length ? buildChartPanel(`cam_${i}`) : ''}
      `).join('')}
    </div>`;

  setTimeout(() => animateBars(container), 80);

  // Render charts per zone
  (data.zones || []).forEach((z, i) => {
    if (z.risk_timeline?.length) {
      renderChart(`riskChart_cam_${i}`, z.risk_timeline, z.risk_level);
    }
  });
}

// ── BUILD CARD ─────────────────────────────────────────
function buildCard(r, delay = 0) {
  const risk = r.risk_level || 'Unknown';
  const icons = { High: '🔴', Medium: '🟡', Low: '🟢', Unknown: '⚪' };
  const vcolor = { High: 'var(--red)', Medium: 'var(--amber)', Low: 'var(--green)', Unknown: 'var(--text-dim)' };

  return `
    <div class="result-card ${risk}" style="animation-delay:${delay}ms; flex:1; min-width:260px">
      <div class="card-topbar"></div>
      <div class="card-header">
        <span class="card-cam-id">${r.camera_id || 'CAM_01'}</span>
        <div class="risk-pill ${risk}">
          <div class="risk-dot"></div>${risk.toUpperCase()}
        </div>
      </div>
      <div class="card-body">
        <div class="metrics-grid">
          <div class="metric-box">
            <div class="metric-val" style="color:${vcolor[risk]}">${r.people_count ?? '—'}</div>
            <div class="metric-lbl">People Detected</div>
          </div>
          <div class="metric-box">
            <div class="metric-val" style="color:${vcolor[risk]}">${r.risk_score ?? '—'}</div>
            <div class="metric-lbl">Risk Score /100</div>
          </div>
          <div class="metric-box">
            <div class="metric-val">${r.peak_people_count ?? '—'}</div>
            <div class="metric-lbl">Peak Count</div>
          </div>
          <div class="metric-box">
            <div class="metric-val">${r.chaos_factor !== undefined ? (r.chaos_factor * 100).toFixed(0) + '%' : '—'}</div>
            <div class="metric-lbl">Chaos Factor</div>
          </div>
        </div>

        ${buildRiskBar('OVERALL RISK', r.risk_score ?? 0, risk)}

        <div class="action-box ${risk}">
          <span class="action-icon">${icons[risk]}</span>
          <span>${r.alert?.recommended_action || '—'}</span>
        </div>

        ${r.bottleneck_detected
      ? `<div class="bottleneck-tag">⚠ BOTTLENECK DETECTED NEAR EXIT</div>` : ''}

        ${r.timestamp ? `<div class="card-timestamp">${r.timestamp}</div>` : ''}
      </div>
    </div>`;
}

// ── SCORE BREAKDOWN ────────────────────────────────────
function buildScoreBreakdown(r) {
  return `
    <div class="score-breakdown">
      <div class="breakdown-title">
        <span class="section-tag">SCORES</span>
        <span style="font-size:13px; font-weight:600; letter-spacing:1px;">RISK BREAKDOWN</span>
      </div>
      ${buildRiskBar('DENSITY SCORE', r.density_score ?? 0, scoreToLevel(r.density_score))}
      ${buildRiskBar('MOTION ANOMALY', r.motion_score ?? 0, scoreToLevel(r.motion_score))}
      ${buildRiskBar('BOTTLENECK', r.bottleneck_score ?? 0, scoreToLevel(r.bottleneck_score))}
      ${buildRiskBar('FINAL RISK', r.risk_score ?? 0, r.risk_level || 'Low')}

      <div class="formula-box">
        <div class="formula-label">RISK FORMULA</div>
        <div class="formula-text">
          0.5 × Density + 0.3 × Motion + 0.2 × Bottleneck
        </div>
        <div class="formula-weights">
          <span>Density: <b>${r.density_score ?? 0}</b></span>
          <span>Motion: <b>${r.motion_score ?? 0}</b></span>
          <span>Bottleneck: <b>${r.bottleneck_score ?? 0}</b></span>
          <span style="color:var(--cyan)">→ Risk: <b>${r.risk_score ?? 0}</b></span>
        </div>
      </div>
    </div>`;
}

function buildRiskBar(label, score, level) {
  return `
    <div class="risk-bar-section">
      <div class="risk-bar-header">
        <span>${label}</span><span>${typeof score === 'number' ? score.toFixed(0) : 0} / 100</span>
      </div>
      <div class="risk-bar-track">
        <div class="risk-bar-fill ${level}" style="width:0%" data-width="${score}%"></div>
      </div>
    </div>`;
}

function scoreToLevel(score) {
  if (!score && score !== 0) return 'Unknown';
  if (score < 40) return 'Low';
  if (score < 70) return 'Medium';
  return 'High';
}

// ── HEATMAP PANEL ──────────────────────────────────────
function buildHeatmapPanel(r, camId) {
  if (!r.heatmap_base64) return '';
  return `
    <div class="heatmap-panel">
      <div class="panel-sub-header">
        <span class="section-tag">HEATMAP</span>
        <span class="panel-sub-title">CROWD DENSITY HEATMAP — ${camId}</span>
        <span class="heatmap-legend">
          <span class="legend-item"><span class="legend-dot" style="background:#0000ff"></span>Low</span>
          <span class="legend-item"><span class="legend-dot" style="background:#00ff00"></span>Med</span>
          <span class="legend-item"><span class="legend-dot" style="background:#ff0000"></span>High</span>
        </span>
      </div>
      <div class="heatmap-wrap">
        <img class="heatmap-img" src="data:image/jpeg;base64,${r.heatmap_base64}" alt="Crowd Density Heatmap"/>
        <div class="heatmap-overlay-label">CROWD PRESSURE MAP</div>
      </div>
    </div>`;
}

// ── CHART PANEL ────────────────────────────────────────
function buildChartPanel(id) {
  return `
    <div class="chart-panel">
      <div class="panel-sub-header">
        <span class="section-tag">TIMELINE</span>
        <span class="panel-sub-title">RISK SCORE OVER TIME</span>
      </div>
      <div class="chart-wrap">
        <canvas id="riskChart_${id}"></canvas>
      </div>
    </div>`;
}

function renderChart(canvasId, timeline, riskLevel) {
  const el = document.getElementById(canvasId);
  if (!el) return;

  const color = { High: '#ff3d3d', Medium: '#ffb347', Low: '#39ff85' }[riskLevel] || '#00f5d4';
  const labels = timeline.map((_, i) => `F${i + 1}`);

  chartInstances[canvasId] = new Chart(el, {
    type: 'line',
    data: {
      labels,
      datasets: [{
        label: 'Risk Score',
        data: timeline,
        borderColor: color,
        backgroundColor: color.replace(')', ', 0.08)').replace('rgb', 'rgba').replace('#', '').padStart(7, '#'),
        fill: true,
        tension: 0.4,
        pointRadius: 2,
        pointHoverRadius: 5,
        borderWidth: 2,
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          backgroundColor: '#0f1318',
          borderColor: '#1a2030',
          borderWidth: 1,
          titleColor: '#c8d8e8',
          bodyColor: color,
          titleFont: { family: 'JetBrains Mono', size: 10 },
          bodyFont: { family: 'JetBrains Mono', size: 12 },
        }
      },
      scales: {
        x: {
          ticks: { color: '#4a6080', font: { family: 'JetBrains Mono', size: 9 }, maxTicksLimit: 10 },
          grid: { color: '#1a2030' }
        },
        y: {
          min: 0, max: 100,
          ticks: { color: '#4a6080', font: { family: 'JetBrains Mono', size: 9 } },
          grid: { color: '#1a2030' }
        }
      }
    }
  });
}

// ── HELPERS ────────────────────────────────────────────
function animateBars(container) {
  container.querySelectorAll('.risk-bar-fill[data-width]').forEach(el => {
    el.style.width = el.dataset.width;
  });
}

function setLoading(btn, loading, label) {
  btn.classList.toggle('loading', loading);
  btn.querySelector('.btn-label').textContent = label;
  btn.disabled = loading;
}

function showErr(el, msg) {
  el.textContent = `⚠ ${msg} — Make sure backend is running & port 8000 is open on AWS`;
  el.style.display = 'block';
}

// Observe DOM changes to animate bars on dynamic inserts
new MutationObserver(() => {
  document.querySelectorAll('.risk-bar-fill[data-width]').forEach(el => {
    if (el.style.width === '0%' || el.style.width === '') {
      setTimeout(() => el.style.width = el.dataset.width, 60);
    }
  });
}).observe(document.body, { childList: true, subtree: true });


/* ════════════════════════════════════════════════════════════════════════════
   NEW ADDITIONS FOR LIVE PROTOTYPE Presentation (DO NOT REMOVE)
════════════════════════════════════════════════════════════════════════════ */

// ── LIVE WEBSOCKET HANDLER ────────────────────────────
let liveSocket = null;

function initLiveStream() {
  const base = getBase();
  const wsUrl = base.replace('http', 'ws') + '/ws';

  console.log("🔗 Attempting WebSocket connection to:", wsUrl);
  liveSocket = new WebSocket(wsUrl);

  liveSocket.onopen = () => {
    console.log("🚀 Live Stream Socket Connected");
    document.getElementById('footerStatus').textContent = 'LIVE STREAM ACTIVE';
  };

  liveSocket.onmessage = (event) => {
    const data = JSON.parse(event.data);

    // Data format expected: { "streams": { "CAM_01": {...}, "CAM_03": {...} } }
    if (data.streams) {
      Object.entries(data.streams).forEach(([camId, streamData]) => {

        // 1. Update Camera Video Frame
        const imgEl = document.getElementById(`${camId}-stream`);
        if (imgEl && streamData.heatmap_base64) {
          imgEl.src = "data:image/jpeg;base64," + streamData.heatmap_base64;
          imgEl.style.opacity = "1";
        }

        // 2. Update Dashboard Numbers (Demo Focal Point)
        // We use CAM_03 as our primary "Incident Zone" for the demo
        if (camId === "CAM_03" || camId === "CAM_01") {
          const totalDisplay = document.getElementById('total-count');
          const chaosDisplay = document.getElementById('chaos-val');
          const riskDisplay = document.getElementById('critical-count');

          if (totalDisplay) totalDisplay.innerText = streamData.people_count.toString().padStart(3, '0');
          if (chaosDisplay) chaosDisplay.innerText = (streamData.chaos_factor * 100).toFixed(0) + '%';
          if (riskDisplay) riskDisplay.innerText = streamData.people_count;
        }
      });
    }
  };

  liveSocket.onclose = () => {
    console.warn("🔌 Socket Disconnected. Retrying in 3s...");
    setTimeout(initLiveStream, 3000);
  };

  liveSocket.onerror = (err) => {
    console.error("❌ WebSocket Error:", err);
  };
}

// ── MANUAL PER-CAMERA UPLOAD (For Prototype Presentation) ──
async function uploadToLiveCam(camId) {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = 'video/mp4,video/x-m4v,video/*';

  input.onchange = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    const url = getBase();
    const formData = new FormData();
    formData.append('file', file);

    document.getElementById('footerStatus').textContent = `UPLOADING FEED TO ${camId}...`;

    try {
      const res = await fetch(`${url}/upload-to-cam/${camId}`, {
        method: 'POST',
        body: formData
      });

      if (res.ok) {
        document.getElementById('footerStatus').textContent = `✅ ${camId} SOURCE UPDATED: ${file.name}`;
        console.log(`Successfully linked ${file.name} to ${camId}`);
      } else {
        throw new Error("Failed to upload video to camera slot.");
      }
    } catch (err) {
      console.error("Upload Error:", err);
      document.getElementById('footerStatus').textContent = "❌ UPLOAD FAILED";
    }
  };

  input.click();
}                  