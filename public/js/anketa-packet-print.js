(async function initAnketaPacketPrint() {
  if (!/anketa-packet-print\.html/i.test(window.location.pathname || '')) return;

  if (!(window.Auth && Auth.isLoggedIn()) && !sessionStorage.getItem('token')) {
    window.location.href = '/admin/login.html';
    return;
  }

  const params = new URLSearchParams(window.location.search);
  const anketaId = params.get('anketaId') || params.get('id');
  const contractId = params.get('contractId');
  const forceView = String(params.get('view') || '').toLowerCase();
  const sheet = document.getElementById('sheet');
  const contractPage = document.getElementById('contract-page');

  if (!anketaId) {
    if (sheet) sheet.innerHTML = '<p class="err">Anketa ID tapylmady</p>';
    if (contractPage) contractPage.innerHTML = '';
    return;
  }

  const esc = (v) => String(v ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

  try {
    const token = (window.Auth && Auth.getToken()) || sessionStorage.getItem('token') || '';
    const anketaRes = await fetch(`/api/anketas/print/${encodeURIComponent(anketaId)}`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    });
    const anketaJson = await anketaRes.json().catch(() => ({}));
    if (!anketaRes.ok) throw new Error(anketaJson.message || `Anketa ýüklenmedi (${anketaRes.status})`);
    if (!anketaJson.data) throw new Error('Anketa maglumaty ýok');
    if (typeof window.renderAnketaPrintSheet !== 'function') {
      throw new Error('Anketa çap formaty ýüklenmedi');
    }
    const a = anketaJson.data;

    let shownScan = false;
    if (window.AnketaScanView?.loadScanIntoElement) {
      try {
        const r = await AnketaScanView.loadScanIntoElement(sheet, anketaId, a.anketaNumber, forceView);
        shownScan = Boolean(r?.shown);
        if (shownScan) sheet.classList.add('scan-anketa-wrap--print');
      } catch { /* forma */ }
    }
    if (!shownScan) {
      document.body.classList.remove('anketa-scan-mode');
      if (typeof window.ensurePrintSkillLists === 'function') {
        await window.ensurePrintSkillLists();
      }
      sheet.innerHTML = window.renderAnketaPrintSheet(a);
    }

    let cid = contractId;
    if (!cid) {
      const created = await api.post(`/contracts/from-anketa/${encodeURIComponent(anketaId)}`, {});
      cid = created?.data?.id;
    }
    if (!cid) throw new Error('Şertnama döredilmedi');

    const cRes = await api.get(`/contracts/${encodeURIComponent(cid)}/print`);
    if (typeof window.renderContractPrintHtml !== 'function') {
      throw new Error('Şertnama çap formaty ýüklenmedi');
    }
    contractPage.innerHTML = window.renderContractPrintHtml(cRes.data);

    const aNo = anketaJson.data.anketaNumber || anketaId;
    const cNo = cRes.data?.contractNumber || cid;
    document.title = `Anketa № ${aNo} + Şertnama № ${cNo}`;
  } catch (err) {
    document.body.classList.remove('anketa-scan-mode');
    const msg = esc(err.message || 'Ýalňyşlyk');
    if (sheet && sheet.querySelector('.loading')) {
      sheet.innerHTML = `<p class="err">${msg}</p>`;
    }
    if (contractPage) {
      contractPage.innerHTML = `<p style="color:red">${msg}</p>`;
    }
  }
})();
