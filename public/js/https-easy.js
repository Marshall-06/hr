/**
 * Lokal tor (http://IP:8000): kamera brauzerde ýapyk.
 * HTTPS (https://IP:8443) açmak üçin banner görkezýär.
 *
 * Muhim: operatorlar öz PC-lerinde localhost:8443 açmaly däl —
 * admin kompýuteriniň IP-si: https://192.168.x.x:8443
 * USB webkamera şol operator PC-däki brauzere birikýär.
 */
(function () {
  try {
    const HTTPS_PORT = Number(window.KERWEN_HTTPS_PORT || 8443);
    const host = location.hostname || '';
    const isLoopback = host === 'localhost' || host === '127.0.0.1';
    const onHttp = location.protocol === 'http:';

    // HTTP + LAN IP → HTTPS şol IP bilen
    // HTTP + localhost → HTTPS localhost (admin PC-de kamera synagy)
    let httpsUrl = '';
    if (onHttp) {
      httpsUrl = `https://${host || 'localhost'}:${HTTPS_PORT}${location.pathname}${location.search || ''}`;
    }

    window.KERWEN_HTTPS_PORT = HTTPS_PORT;
    window.KERWEN_HTTPS_URL = httpsUrl;

    if (!httpsUrl || sessionStorage.getItem('kerwen_https_banner_hide') === '1') return;
    // Eýýäm howpsuz kontekst — banner gerek däl
    if (window.isSecureContext) return;

    function mount() {
      if (document.getElementById('kerwen-https-banner')) return;
      if (!document.body) return;
      const bar = document.createElement('div');
      bar.id = 'kerwen-https-banner';
      bar.setAttribute('role', 'status');
      bar.style.cssText = [
        'position:sticky', 'top:0', 'z-index:9999',
        'background:linear-gradient(90deg,#2f3b46,#3d5a73)',
        'color:#fff', 'padding:10px 14px',
        'box-shadow:0 4px 16px rgba(0,0,0,.15)',
        'font-family:Manrope,sans-serif', 'font-size:14px',
      ].join(';');

      const tip = isLoopback
        ? 'Operatorlar IP bilen girsin (KerwenKadr DNS köplenç işlemez). Mysal: https://ADMIN_IP:8443'
        : 'DNS ýalňyşlygy bolsa IP bilen giriň. Hemişelik IP: admin PC-de tools\\hemiselik-ip.bat';

      bar.innerHTML = `
        <div style="max-width:1100px;margin:0 auto;display:flex;gap:12px;align-items:center;flex-wrap:wrap;justify-content:space-between">
          <div style="flex:1;min-width:220px;line-height:1.4">
            <strong style="display:block;margin-bottom:2px">Webkamera üçin HTTPS</strong>
            <span style="opacity:.92;font-size:13px">${tip}</span>
          </div>
          <div style="display:flex;gap:8px;flex-wrap:wrap">
            <a href="${httpsUrl}" style="display:inline-block;background:#a6853d;color:#fff;text-decoration:none;padding:8px 14px;border-radius:8px;font-weight:600">HTTPS aç (IP)</a>
            <a href="/admin/operator-giris.html" style="display:inline-block;background:transparent;border:1px solid rgba(255,255,255,.45);color:#fff;text-decoration:none;padding:8px 12px;border-radius:8px;font-weight:600">Operator giriş</a>
            <button type="button" id="kerwen-https-dismiss" style="background:transparent;border:1px solid rgba(255,255,255,.35);color:#fff;padding:8px 12px;border-radius:8px;cursor:pointer">Ýap</button>
          </div>
        </div>`;
      document.body.prepend(bar);
      document.getElementById('kerwen-https-dismiss')?.addEventListener('click', () => {
        sessionStorage.setItem('kerwen_https_banner_hide', '1');
        bar.remove();
      });
    }

    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', mount);
    } else {
      mount();
    }
  } catch (e) {
    window.KERWEN_HTTPS_URL = '';
  }
})();
