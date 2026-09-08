/**
 * Owadan diagrammalar (CDN gerekmeýär).
 * Chart.js-e meňzeş API.
 */
(function (global) {
  const PALETTE = ['#a6853d', '#3d5a73', '#3d6b4f', '#6d28d9', '#0f766e', '#9b3d3d', '#5c6570', '#c4a35a'];

  function cssColor(i) {
    return PALETTE[i % PALETTE.length];
  }

  function hexToRgba(hex, a) {
    const h = String(hex || '#888').replace('#', '');
    const full = h.length === 3 ? h.split('').map((c) => c + c).join('') : h;
    const n = parseInt(full.slice(0, 6), 16);
    if (Number.isNaN(n)) return `rgba(100,100,100,${a})`;
    const r = (n >> 16) & 255;
    const g = (n >> 8) & 255;
    const b = n & 255;
    return `rgba(${r},${g},${b},${a})`;
  }

  function clear(ctx, w, h) {
    ctx.clearRect(0, 0, w, h);
    const g = ctx.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, '#fffcf7');
    g.addColorStop(1, '#f7f4ee');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
  }

  function maxOf(arr) {
    let m = 0;
    (arr || []).forEach((n) => { if (Number(n) > m) m = Number(n); });
    return m || 1;
  }

  function formatAxisValue(value) {
    const n = Number(value) || 0;
    if (Math.abs(n) >= 1000000) return `${(n / 1000000).toFixed(n >= 10000000 ? 0 : 1)}m`;
    if (Math.abs(n) >= 1000) return `${(n / 1000).toFixed(n >= 10000 ? 0 : 1)}k`;
    return String(Math.round(n));
  }

  function resolveSize(canvas, ctx, fallbackW, fallbackH) {
    if (!canvas) return { w: fallbackW, h: fallbackH };
    const parent = canvas.parentElement;
    let w = Math.floor(canvas.clientWidth || parent?.clientWidth || 0);
    let h = Math.floor(canvas.clientHeight || parent?.clientHeight || 0);
    if (w < 80) w = fallbackW;
    if (h < 80) h = fallbackH;
    canvas.style.display = 'block';
    canvas.style.width = '100%';
    canvas.style.height = `${h}px`;
    w = Math.floor(canvas.clientWidth || parent?.clientWidth || w);
    if (w < 80) w = fallbackW;
    // HiDPI — anyk, arassa çyzgy
    const dpr = Math.min(Math.max(global.devicePixelRatio || 1, 1), 3);
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
    if (ctx) {
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.scale(dpr, dpr);
      ctx.textBaseline = 'alphabetic';
    }
    return { w, h };
  }

  function roundRect(ctx, x, y, w, h, r) {
    const rr = Math.min(r, w / 2, h / 2);
    ctx.beginPath();
    ctx.moveTo(x + rr, y);
    ctx.arcTo(x + w, y, x + w, y + h, rr);
    ctx.arcTo(x + w, y + h, x, y + h, rr);
    ctx.arcTo(x, y + h, x, y, rr);
    ctx.arcTo(x, y, x + w, y, rr);
    ctx.closePath();
  }

  function drawLegend(ctx, items, x, y, maxX = Infinity) {
    ctx.font = '600 11px Manrope, sans-serif';
    let lx = x;
    let ly = y;
    items.forEach((it, i) => {
      const color = it.color || cssColor(i);
      const itemW = ctx.measureText(it.label).width + 28;
      if (lx > x && lx + itemW > maxX) {
        lx = x;
        ly += 17;
      }
      ctx.beginPath();
      ctx.arc(lx + 5, ly - 3, 5, 0, Math.PI * 2);
      ctx.fillStyle = color;
      ctx.fill();
      ctx.fillStyle = '#5c6570';
      ctx.fillText(it.label, lx + 14, ly);
      lx += itemW;
    });
    return ly;
  }

  function drawGrid(ctx, pad, plotW, plotH, maxV) {
    ctx.strokeStyle = 'rgba(207, 200, 187, 0.55)';
    ctx.lineWidth = 1;
    ctx.setLineDash([4, 4]);
    for (let g = 0; g <= 4; g += 1) {
      const y = pad.t + (plotH * g) / 4;
      ctx.beginPath();
      ctx.moveTo(pad.l, y);
      ctx.lineTo(pad.l + plotW, y);
      ctx.stroke();
      ctx.fillStyle = '#8a92a0';
      ctx.font = '11px Manrope, sans-serif';
      ctx.setLineDash([]);
      ctx.fillText(formatAxisValue(maxV * (1 - g / 4)), 6, y + 4);
      ctx.setLineDash([4, 4]);
    }
    ctx.setLineDash([]);
  }

  function lineChart(canvas, { labels = [], datasets = [] } = {}) {
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const { w, h } = resolveSize(canvas, ctx, 720, 280);
    clear(ctx, w, h);
    const pad = { t: datasets.length > 2 && w < 680 ? 54 : 36, r: 18, b: 42, l: 48 };
    const plotW = Math.max(40, w - pad.l - pad.r);
    const plotH = Math.max(40, h - pad.t - pad.b);
    const allVals = datasets.flatMap((d) => d.data || []);
    const maxV = maxOf(allVals) * 1.18;
    const n = Math.max(labels.length, 1);

    drawGrid(ctx, pad, plotW, plotH, maxV);
    drawLegend(ctx, datasets.map((d, i) => ({
      label: d.label || `D${i + 1}`,
      color: d.borderColor || cssColor(i),
    })), pad.l, 18, w - pad.r);

    datasets.forEach((ds, di) => {
      const data = ds.data || [];
      const color = ds.borderColor || cssColor(di);
      const pts = data.map((v, i) => ({
        x: pad.l + (n === 1 ? plotW / 2 : (i / Math.max(n - 1, 1)) * plotW),
        y: pad.t + plotH - (Number(v) / maxV) * plotH,
      }));

      // Area fill
      if (pts.length) {
        const grad = ctx.createLinearGradient(0, pad.t, 0, pad.t + plotH);
        grad.addColorStop(0, hexToRgba(color, 0.28));
        grad.addColorStop(1, hexToRgba(color, 0.02));
        ctx.beginPath();
        ctx.moveTo(pts[0].x, pad.t + plotH);
        pts.forEach((p) => ctx.lineTo(p.x, p.y));
        ctx.lineTo(pts[pts.length - 1].x, pad.t + plotH);
        ctx.closePath();
        ctx.fillStyle = grad;
        ctx.fill();
      }

      ctx.strokeStyle = color;
      ctx.lineWidth = 2.8;
      ctx.lineJoin = 'round';
      ctx.lineCap = 'round';
      ctx.beginPath();
      pts.forEach((p, i) => (i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y)));
      ctx.stroke();

      pts.forEach((p) => {
        ctx.beginPath();
        ctx.arc(p.x, p.y, 4.5, 0, Math.PI * 2);
        ctx.fillStyle = '#fff';
        ctx.fill();
        ctx.strokeStyle = color;
        ctx.lineWidth = 2;
        ctx.stroke();
      });
    });

    const labelStep = Math.max(1, Math.ceil(n / Math.max(4, Math.floor(plotW / 58))));
    labels.forEach((lab, i) => {
      if (i % labelStep !== 0 && i !== n - 1) return;
      const x = pad.l + (n === 1 ? plotW / 2 : (i / Math.max(n - 1, 1)) * plotW);
      ctx.fillStyle = '#7a8490';
      ctx.font = '10px Manrope, sans-serif';
      const text = String(lab).length > 9 ? `${String(lab).slice(0, 8)}…` : String(lab);
      ctx.fillText(text, x - 14, h - 12);
    });
  }

  function barChart(canvas, { labels = [], datasets = [], showValues = null } = {}) {
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const { w, h } = resolveSize(canvas, ctx, 720, 280);
    clear(ctx, w, h);
    const groups = Math.max(labels.length, 1);
    const series = Math.max(datasets.length, 1);
    const forceValues = showValues === true;
    const autoValues = showValues !== false;
    const pad = {
      t: forceValues || (datasets.length > 2 && w < 680) ? 58 : 42,
      r: 14,
      b: 52,
      l: 48,
    };
    const plotW = Math.max(40, w - pad.l - pad.r);
    const plotH = Math.max(40, h - pad.t - pad.b);
    const allVals = datasets.flatMap((d) => d.data || []);
    const maxV = maxOf(allVals) * 1.22;
    const groupW = plotW / groups;
    const barW = Math.max(6, (groupW * 0.72) / series);

    drawGrid(ctx, pad, plotW, plotH, maxV);
    drawLegend(ctx, datasets.map((d, i) => ({
      label: d.label || `D${i + 1}`,
      color: d.backgroundColor || cssColor(i),
    })), pad.l, 18, w - pad.r);

    const labelStep = Math.max(1, Math.ceil(groups / Math.max(3, Math.floor(plotW / 62))));
    const drawValueLabels = forceValues
      || (autoValues && groups <= 24 && series <= 4);

    labels.forEach((lab, gi) => {
      datasets.forEach((ds, si) => {
        const v = Number((ds.data || [])[gi] || 0);
        const x = pad.l + gi * groupW + groupW * 0.14 + si * barW;
        const bw = Math.max(3, barW - 3);
        const bh = Math.max(0, (v / maxV) * plotH);
        const y = pad.t + plotH - bh;
        const color = ds.backgroundColor || cssColor(si);
        const grad = ctx.createLinearGradient(x, y, x, y + bh || 1);
        grad.addColorStop(0, color);
        grad.addColorStop(1, hexToRgba(color, 0.65));
        ctx.fillStyle = grad;
        roundRect(ctx, x, y, bw, Math.max(bh, v > 0 ? 3 : 0), 5);
        ctx.fill();

        // Her sütüniň ýokarsynda bahasy hemişe (girdeji we ş.m.)
        if (drawValueLabels && (v > 0 || forceValues)) {
          const txt = formatAxisValue(v);
          ctx.font = forceValues
            ? `700 ${Math.max(9, Math.min(11, Math.floor(groupW / 4)))}px Manrope, sans-serif`
            : '600 9px Manrope, sans-serif';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'bottom';
          // Fon — gradient üstünde okalmak üçin
          const tw = ctx.measureText(txt).width;
          const tx = x + bw / 2;
          const ty = Math.max(pad.t - 2, y - 5);
          ctx.fillStyle = 'rgba(255,252,247,0.92)';
          roundRect(ctx, tx - tw / 2 - 3, ty - 12, tw + 6, 14, 4);
          ctx.fill();
          ctx.fillStyle = '#2a2f36';
          ctx.fillText(txt, tx, ty);
          ctx.textBaseline = 'alphabetic';
          ctx.textAlign = 'left';
        }
      });
      if (gi % labelStep !== 0 && gi !== groups - 1) return;
      ctx.fillStyle = '#7a8490';
      ctx.font = '10px Manrope, sans-serif';
      const text = String(lab).length > 11 ? `${String(lab).slice(0, 10)}…` : String(lab);
      ctx.save();
      ctx.translate(pad.l + gi * groupW + groupW / 2, h - 10);
      ctx.rotate(-0.28);
      ctx.fillText(text, -16, 0);
      ctx.restore();
    });
  }

  function doughnutChart(canvas, { labels = [], values = [], colors = [] } = {}) {
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const { w, h } = resolveSize(canvas, ctx, 380, 280);
    clear(ctx, w, h);

    const stacked = w < 500;
    const legendW = stacked ? w - 28 : Math.min(165, w * 0.42);
    const chartW = stacked ? w : w - legendW - 8;
    const cx = stacked ? w / 2 : chartW / 2 + 8;
    const cy = stacked ? Math.min(h * 0.34, 92) : h / 2;
    const r = stacked
      ? Math.min(w * 0.22, h * 0.27)
      : Math.min(chartW, h) * 0.34;
    const total = values.reduce((s, v) => s + (Number(v) || 0), 0) || 1;

    // soft shadow ring
    ctx.beginPath();
    ctx.arc(cx + 2, cy + 3, r, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(42, 47, 54, 0.06)';
    ctx.fill();

    let angle = -Math.PI / 2;
    values.forEach((v, i) => {
      const slice = (Number(v) / total) * Math.PI * 2;
      if (slice <= 0) return;
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.arc(cx, cy, r, angle, angle + slice);
      ctx.closePath();
      ctx.fillStyle = colors[i] || cssColor(i);
      ctx.fill();
      angle += slice;
    });

    // hole
    ctx.beginPath();
    ctx.arc(cx, cy, r * 0.58, 0, Math.PI * 2);
    ctx.fillStyle = '#fffcf7';
    ctx.fill();

    ctx.fillStyle = '#2a2f36';
    ctx.font = '700 18px Manrope, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(String(Math.round(total)), cx, cy + 2);
    ctx.fillStyle = '#7a8490';
    ctx.font = '11px Manrope, sans-serif';
    ctx.fillText('jemi', cx, cy + 18);
    ctx.textAlign = 'left';

    const lx = stacked ? 18 : w - legendW + 4;
    let ly = stacked
      ? Math.max(cy + r + 18, h - labels.length * 24 - 8)
      : Math.max(24, (h - labels.length * 26) / 2);
    labels.forEach((lab, i) => {
      const val = Number(values[i] || 0);
      const pct = total ? Math.round((val / total) * 100) : 0;
      ctx.beginPath();
      ctx.arc(lx + 6, ly + 2, 6, 0, Math.PI * 2);
      ctx.fillStyle = colors[i] || cssColor(i);
      ctx.fill();
      ctx.fillStyle = '#2a2f36';
      ctx.font = '600 12px Manrope, sans-serif';
      const maxChars = stacked ? 24 : 16;
      const name = String(lab).length > maxChars
        ? `${String(lab).slice(0, maxChars - 1)}…`
        : String(lab);
      ctx.fillText(name, lx + 18, ly + 6);
      ctx.fillStyle = '#7a8490';
      ctx.font = '11px Manrope, sans-serif';
      ctx.fillText(`${val} · ${pct}%`, lx + 18, ly + 20);
      ly += 28;
    });
  }

  class MiniChart {
    constructor(canvas, config) {
      this.canvas = canvas;
      this.config = config || {};
      this._onResize = () => {
        clearTimeout(this._resizeTimer);
        this._resizeTimer = setTimeout(() => this.render(), 120);
      };
      window.addEventListener('resize', this._onResize);
      if (typeof ResizeObserver !== 'undefined' && canvas.parentElement) {
        this._lastSize = '';
        this._observer = new ResizeObserver((entries) => {
          const box = entries[0]?.contentRect;
          const next = box ? `${Math.round(box.width)}x${Math.round(box.height)}` : '';
          if (!next || next === this._lastSize) return;
          this._lastSize = next;
          this._onResize();
        });
        this._observer.observe(canvas.parentElement);
      }
      this.render();
    }

    render() {
      const type = this.config.type;
      const data = this.config.data || {};
      if (type === 'line') {
        lineChart(this.canvas, { labels: data.labels, datasets: data.datasets });
      } else if (type === 'bar') {
        barChart(this.canvas, {
          labels: data.labels,
          datasets: data.datasets,
          showValues: this.config.options?.showValues,
        });
      } else if (type === 'doughnut' || type === 'pie') {
        const ds = (data.datasets && data.datasets[0]) || {};
        doughnutChart(this.canvas, {
          labels: data.labels,
          values: ds.data || [],
          colors: ds.backgroundColor || [],
        });
      }
    }

    destroy() {
      window.removeEventListener('resize', this._onResize);
      if (this._observer) this._observer.disconnect();
      clearTimeout(this._resizeTimer);
      if (!this.canvas) return;
      const ctx = this.canvas.getContext('2d');
      if (ctx) ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    }

    update() {
      this.render();
    }
  }

  function ChartCompat(canvas, config) {
    return new MiniChart(canvas, config);
  }
  ChartCompat.register = function () {};

  global.MiniCharts = { lineChart, barChart, doughnutChart, MiniChart };
  global.Chart = ChartCompat;
})(typeof window !== 'undefined' ? window : globalThis);
