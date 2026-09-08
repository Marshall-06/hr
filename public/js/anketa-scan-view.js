/**
 * Eski skan JPG — ähli sahypalar (görkeziş, çap, deňeşdirme → anketa açylanda).
 */
(function initAnketaScanView(global) {
  function authToken() {
    return (global.Auth && Auth.getToken()) || sessionStorage.getItem('token') || '';
  }

  function escAttr(v) {
    return String(v ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  async function fetchScanMeta(anketaId) {
    const res = await api.get(`/photos/scan-meta/${anketaId}`, { timeoutMs: 60000 });
    return res.data || {};
  }

  async function fetchScanBlobUrl(scanApiUrl) {
    const token = authToken();
    const url = String(scanApiUrl || '').startsWith('/')
      ? scanApiUrl
      : `/api/photos/${String(scanApiUrl || '').replace(/^\/api/, '')}`;
    const r = await fetch(url, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    });
    if (!r.ok) throw new Error('Skan ýüklenmedi');
    return URL.createObjectURL(await r.blob());
  }

  /**
   * Papkada № boýunça JPG bar bolsa — skan görkez (daşarky papka).
   * Ýok bolsa köne düzgün: 2026 awgustyň öňi.
   * @param {number|string} anketaId
   * @param {string} [forceView] form|programma|scan|jpg — diňe açyk URL (düwme ýok)
   */
  async function resolveScanDisplay(anketaId, forceView) {
    const force = String(forceView || '').toLowerCase();
    try {
      const d = await fetchScanMeta(anketaId);
      const url = d.scanUrl || '';
      const found = Boolean(d.found && url);
      const preferScan = Boolean(d.preferScan);
      if (force === 'form' || force === 'programma') {
        return { show: false, url, preferScan, found };
      }
      if (force === 'scan' || force === 'jpg') {
        return { show: found, url, preferScan, found };
      }
      // Saýlanan papkada №.jpg bar → hemişe skan (başga papkadan)
      if (found) {
        return { show: true, url, preferScan: true, found: true };
      }
      return { show: false, url, preferScan, found: false };
    } catch {
      return { show: false, url: '', preferScan: false, found: false };
    }
  }

  function renderScanHtml(imgSrc, anketaNumber) {
    const no = escAttr(anketaNumber || '');
    return `
      <div class="scan-anketa-wrap">
        <img class="scan-anketa-page" src="${escAttr(imgSrc)}" alt="Skan anketa № ${no}">
      </div>`;
  }

  async function loadScanIntoElement(el, anketaId, anketaNumber, forceView) {
    if (!el) return { shown: false };
    const scan = await resolveScanDisplay(anketaId, forceView);
    if (!scan.show || !scan.url) {
      global.document?.body?.classList?.remove('anketa-scan-mode');
      return { shown: false, scan };
    }
    global.document?.body?.classList?.add('anketa-scan-mode');
    const objUrl = await fetchScanBlobUrl(scan.url);
    el.innerHTML = renderScanHtml(objUrl, anketaNumber);
    el.classList.add('anketa-view-sheet--scan');
    return { shown: true, scan, objUrl };
  }

  global.AnketaScanView = {
    fetchScanMeta,
    fetchScanBlobUrl,
    resolveScanDisplay,
    renderScanHtml,
    loadScanIntoElement,
  };
})(window);
