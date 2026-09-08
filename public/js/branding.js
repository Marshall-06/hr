/**
 * Agentlik markasyny .env / API-den ýükleýär.
 * Kerwen default — BRAND_* boş bolsa hiç zat bozulmaýar.
 */
(function (global) {
  const CACHE_KEY = 'agency_branding_v1';
  let cached = null;

  function brandFull() {
    return global.AgencyBrand?.brand?.full || 'Kerwen Agenstwa';
  }

  function brandShort() {
    return global.AgencyBrand?.brand?.short || 'Kerwen';
  }

  function applyFavicon(url) {
    if (!url) return;
    document.querySelectorAll('link[rel="icon"], link[rel="shortcut icon"], link[rel="apple-touch-icon"]').forEach((el) => {
      el.href = url;
    });
  }

  function apply(branding) {
    if (!branding || !branding.brand) return;
    const b = branding.brand;
    const c = branding.company || {};

    document.querySelectorAll('[data-brand="short"]').forEach((el) => {
      el.textContent = b.short || el.textContent;
    });
    document.querySelectorAll('[data-brand="full"]').forEach((el) => {
      el.textContent = b.full || el.textContent;
    });
    document.querySelectorAll('[data-brand="panel"]').forEach((el) => {
      el.textContent = b.panelTitle || el.textContent;
    });
    document.querySelectorAll('[data-brand="tagline"]').forEach((el) => {
      el.textContent = b.tagline || el.textContent;
    });
    document.querySelectorAll('[data-brand="hero"]').forEach((el) => {
      el.textContent = b.heroText || el.textContent;
    });
    document.querySelectorAll('[data-brand="email"]').forEach((el) => {
      if (!c.email) return;
      if (el.tagName === 'A') {
        el.href = `mailto:${c.email}`;
        el.textContent = c.email;
      } else el.textContent = c.email;
    });
    document.querySelectorAll('[data-brand="phone"]').forEach((el) => {
      if (c.phone) el.textContent = c.phone;
    });
    document.querySelectorAll('[data-brand="company"]').forEach((el) => {
      if (c.name) el.textContent = c.name;
    });
    document.querySelectorAll('[data-brand-logo]').forEach((el) => {
      if (b.logoUrl) {
        el.src = b.logoUrl;
        el.alt = b.short || el.alt || '';
      }
    });

    applyFavicon(b.faviconUrl);

    const titleEl = document.querySelector('[data-brand-title]');
    if (titleEl && b.full) {
      const suffix = titleEl.getAttribute('data-brand-title') || '';
      document.title = suffix ? `${suffix} — ${b.full}` : b.full;
    } else if (document.body?.hasAttribute('data-brand-page') && b.full) {
      const page = document.body.getAttribute('data-brand-page');
      if (page === 'login') document.title = `Giriş — ${b.full}`;
      else if (page === 'panel') document.title = `Panel — ${b.full}`;
      else if (page === 'anketa') document.title = `Anketa doldur — ${b.full}`;
      else if (page === 'vacancies') document.title = `Wakansiýalar — ${b.full}`;
      else if (page === 'anketa-new') document.title = `Täze anketa — ${b.full}`;
      else if (page === 'vacancy-new') document.title = `Täze wakansiýa — ${b.full}`;
      else if (page === 'anketa-view') document.title = `Anketa — ${b.full}`;
      else if (page === 'vacancy-view') document.title = `Wakansiýa — ${b.full}`;
    }

    global.AgencyBrand = branding;
    document.dispatchEvent(new CustomEvent('branding-ready', { detail: branding }));
  }

  async function loadBranding() {
    try {
      const raw = sessionStorage.getItem(CACHE_KEY);
      if (raw) {
        cached = JSON.parse(raw);
        apply(cached);
      }
    } catch (e) { /* ignore */ }

    try {
      const res = await fetch('/api/branding', { credentials: 'same-origin' });
      const json = await res.json();
      if (json && json.success && json.data) {
        cached = json.data;
        try { sessionStorage.setItem(CACHE_KEY, JSON.stringify(cached)); } catch (e) { /* ignore */ }
        apply(cached);
      }
    } catch (e) {
      // Offline / serwer ýok — HTML-däki Kerwen default galýar
    }
    return cached;
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', loadBranding);
  } else {
    loadBranding();
  }

  global.loadAgencyBranding = loadBranding;
  global.agencyBrandFull = brandFull;
  global.agencyBrandShort = brandShort;
})(typeof window !== 'undefined' ? window : globalThis);
