/**
 * ESC / ← Yza — hemişe öňki bolan sahypa gaýt.
 * sessionStorage stack + dashboard tab ýady.
 */
(function () {
  const HIST_KEY = 'kerwen_nav_stack';
  const DASH_KEY = 'kerwen_last_dashboard';

  function isDashboardPath(url) {
    return /\/admin\/dashboard\.html/i.test(String(url || ''));
  }

  function isLoginPath(url) {
    return /\/admin\/login\.html$/i.test(String(url || ''));
  }

  function isAnketaViewPath(url) {
    return /\/admin\/anketa-view\.html/i.test(String(url || ''));
  }

  function isVacancyViewPath(url) {
    return /\/admin\/vacancy-view\.html/i.test(String(url || ''));
  }

  function isPrintPath(url) {
    return /contract-print|anketa-print|anketa-packet-print|dil-haty-print/i.test(String(url || ''));
  }

  function isSkippableNavUrl(url) {
    if (!url) return true;
    return isPrintPath(url) || isLoginPath(url);
  }

  function readStack() {
    try {
      const raw = sessionStorage.getItem(HIST_KEY);
      const arr = raw ? JSON.parse(raw) : [];
      return Array.isArray(arr) ? arr : [];
    } catch {
      return [];
    }
  }

  function writeStack(arr) {
    try {
      sessionStorage.setItem(HIST_KEY, JSON.stringify((arr || []).slice(-60)));
    } catch { /* ignore */ }
  }

  function rememberDashboardUrl(url) {
    if (!url || !isDashboardPath(url)) return;
    try { sessionStorage.setItem(DASH_KEY, url); } catch { /* ignore */ }
  }

  function recalledDashboard() {
    try { return sessionStorage.getItem(DASH_KEY) || ''; } catch { return ''; }
  }

  /** Dashboard-da häzirki tab (URL ýa-da sidebar) */
  function getActiveDashboardTab() {
    try {
      const fromUrl = new URLSearchParams(location.search).get('tab');
      if (fromUrl) return fromUrl;
    } catch { /* ignore */ }
    const active = document.querySelector('.sidebar a.active[data-tab], a[data-tab].active');
    if (active) return active.getAttribute('data-tab') || 'dashboard';
    const last = recalledDashboard();
    if (last) {
      try {
        const t = new URL(last, location.origin).searchParams.get('tab');
        if (t) return t;
      } catch { /* ignore */ }
    }
    return 'dashboard';
  }

  /**
   * Dashboard logiki URL — replaceState tab-y öçürse-de Yza dogry tab-a gaýdýar.
   */
  function dashboardLogicalUrl(tabOverride, extraParams) {
    if (!isDashboardPath(location.pathname)) return null;
    const tab = tabOverride || getActiveDashboardTab();
    const q = new URLSearchParams();
    q.set('tab', tab);

    const src = new URLSearchParams(location.search);
    ['vacancyId', 'anketaId', 'created', 'createdType'].forEach((k) => {
      const v = (extraParams && extraParams[k]) || src.get(k);
      if (v) q.set(k, v);
    });

    if (tab === 'match') {
      const vac = document.getElementById('match-vacancy')?.value
        || (extraParams && extraParams.vacancyId)
        || src.get('vacancyId');
      if (vac) q.set('vacancyId', String(vac));
    }

    return `/admin/dashboard.html?${q.toString()}`;
  }

  function currentKey() {
    if (isLoginPath(location.pathname)) {
      return location.pathname + location.search;
    }
    const dash = dashboardLogicalUrl();
    if (dash) {
      rememberDashboardUrl(dash);
      return dash;
    }
    return location.pathname + location.search + location.hash;
  }

  /** Bir sanawdan sag/çep: diňe ?id= üýtgeýär — stack-e goşma */
  function isSiblingNav(prevKey, nextKey) {
    const sameView = (isAnketaViewPath(prevKey) && isAnketaViewPath(nextKey))
      || (isVacancyViewPath(prevKey) && isVacancyViewPath(nextKey));
    if (!sameView) return false;
    try {
      const a = new URL(prevKey, location.origin);
      const b = new URL(nextKey, location.origin);
      if (a.pathname !== b.pathname) return false;
      const pa = a.searchParams;
      const pb = b.searchParams;
      return (pa.get('ids') || '') === (pb.get('ids') || '')
        && (pa.get('return') || '') === (pb.get('return') || '');
    } catch {
      return false;
    }
  }

  function sameLogicalPage(a, b) {
    if (!a || !b) return false;
    if (a === b) return true;
    if (isDashboardPath(a) && isDashboardPath(b)) {
      try {
        const ta = new URL(a, location.origin).searchParams.get('tab') || 'dashboard';
        const tb = new URL(b, location.origin).searchParams.get('tab') || 'dashboard';
        return ta === tb;
      } catch {
        return false;
      }
    }
    return false;
  }

  /** Her sahypa açylanda / tab üýtgände stack-e ýaz */
  function trackPage() {
    if (isLoginPath(location.pathname)) return;
    // Çap täze tab-da — umumy sessionStorage stack-i bozmaz ýaly ýazma
    if (isPrintPath(location.pathname + location.search)) return;

    const key = currentKey();
    if (isDashboardPath(key)) rememberDashboardUrl(key);

    const stack = readStack().filter((u) => !isSkippableNavUrl(u));
    const last = stack[stack.length - 1];

    if (last === key) {
      writeStack(stack);
      return;
    }

    if (last && isSiblingNav(last, key)) {
      stack[stack.length - 1] = key;
      writeStack(stack);
      return;
    }

    // Dashboard içinde tab çalyş — täze stack ýazma, üstüni täzele
    if (last && isDashboardPath(last) && isDashboardPath(key)) {
      stack[stack.length - 1] = key;
      writeStack(stack);
      return;
    }

    stack.push(key);
    writeStack(stack);
  }

  /** Admin switchTab / deep-link soň çagyrylýar */
  function onDashboardTab(tab, extraParams) {
    if (!isDashboardPath(location.pathname)) return;
    const key = dashboardLogicalUrl(tab, extraParams) || currentKey();
    rememberDashboardUrl(key);
    const stack = readStack().filter((u) => !isSkippableNavUrl(u));
    const last = stack[stack.length - 1];
    if (last && isDashboardPath(last)) {
      stack[stack.length - 1] = key;
    } else if (last !== key) {
      stack.push(key);
    }
    writeStack(stack);
  }

  function closeOverlays() {
    const camPanel = document.getElementById('camera-panel');
    if (camPanel && !camPanel.classList.contains('hidden')) {
      document.getElementById('btn-close-camera')?.click();
      return true;
    }

    const photoModal = document.getElementById('photo-edit-modal');
    if (photoModal) {
      photoModal.remove();
      return true;
    }

    const assignModal = document.getElementById('assign-offer-modal');
    if (assignModal && !assignModal.classList.contains('hidden') && assignModal.style.display !== 'none') {
      assignModal.classList.add('hidden');
      assignModal.style.display = 'none';
      assignModal.setAttribute('aria-hidden', 'true');
      return true;
    }

    const optionEditor = document.getElementById('option-list-fallback-modal');
    if (optionEditor) {
      if (typeof window.OptionLists?.close === 'function') window.OptionLists.close();
      else optionEditor.remove();
      return true;
    }

    const tip = document.getElementById('print-word-tip');
    if (tip && tip.style.display !== 'none' && tip.offsetParent) {
      tip.style.display = 'none';
      return true;
    }

    const modal = document.getElementById('modal');
    if (modal && !modal.classList.contains('hidden') && modal.style.display !== 'none') {
      if (typeof window.closeModal === 'function') window.closeModal();
      else {
        modal.classList.add('hidden');
        modal.style.display = 'none';
      }
      return true;
    }

    const fallback = document.getElementById('option-list-fallback-modal');
    if (fallback) {
      fallback.remove();
      return true;
    }

    return false;
  }

  function fallbackHome() {
    const dash = recalledDashboard();
    if (dash) {
      location.href = dash;
      return;
    }
    if ((window.Auth && Auth.isLoggedIn()) || sessionStorage.getItem('token')) {
      location.href = '/admin/dashboard.html';
      return;
    }
    location.href = '/';
  }

  function resolveReturnParam(ret, id) {
    if (!ret) return null;
    if (ret === 'view' && id) {
      if (location.pathname.includes('anketa')) return `/admin/anketa-view.html?id=${id}`;
      if (location.pathname.includes('vacancy')) return `/admin/vacancy-view.html?id=${id}`;
    }
    if (ret.startsWith('/')) return ret;
    if (ret === 'anketas' || ret === 'vacancies' || ret === 'match' || ret === 'assigned'
      || ret === 'dashboard' || ret === 'fees' || ret === 'reports' || ret === 'excel'
      || ret === 'users' || ret === 'settings') {
      return `/admin/dashboard.html?tab=${encodeURIComponent(ret)}`;
    }
    return null;
  }

  function trimStackForBack(here) {
    let stack = readStack().filter((u) => !isSkippableNavUrl(u));
    while (stack.length && sameLogicalPage(stack[stack.length - 1], here)) stack.pop();
    while (stack.length && isAnketaViewPath(stack[stack.length - 1]) && isAnketaViewPath(here)) {
      stack.pop();
    }
    while (stack.length && isVacancyViewPath(stack[stack.length - 1]) && isVacancyViewPath(here)) {
      stack.pop();
    }
    writeStack(stack);
    return stack;
  }

  /**
   * Soňky sahypa: history.back → return= → stack → dashboard
   * Brauzer ← → strelka üçin ilki history.back (täze ýazgy döretmez).
   */
  function goBack() {
    if (typeof window.PrintNav?.goBack === 'function' && isPrintPath(location.pathname)) {
      window.PrintNav.goBack();
      return;
    }

    const here = currentKey();
    const qs = new URLSearchParams(location.search);
    const fromReturn = resolveReturnParam(qs.get('return'), qs.get('id') || qs.get('anketaId'));

    // Brauzer taryhy — cep/sag strelka işleýär, forward hem açylýar
    if (history.length > 1) {
      const ref = document.referrer || '';
      if (!ref || ref.startsWith(location.origin)) {
        // return bar bolsa we referrer şol tab/sahypa bilen gabat gelse — back ýeterlik
        let refOk = true;
        if (fromReturn && ref) {
          try {
            const refKey = isDashboardPath(ref)
              ? (() => {
                const u = new URL(ref, location.origin);
                const t = u.searchParams.get('tab') || 'dashboard';
                return `/admin/dashboard.html?tab=${t}`;
              })()
              : (new URL(ref, location.origin).pathname + new URL(ref, location.origin).search);
            refOk = sameLogicalPage(refKey, fromReturn)
              || refKey === fromReturn
              || (isDashboardPath(ref) && isDashboardPath(fromReturn));
          } catch {
            refOk = true;
          }
        }
        if (refOk || !fromReturn) {
          trimStackForBack(here);
          history.back();
          return;
        }
      }
    }

    if (fromReturn && !sameLogicalPage(fromReturn, here) && !isSkippableNavUrl(fromReturn)) {
      trimStackForBack(here);
      location.href = fromReturn;
      return;
    }

    let stack = trimStackForBack(here);
    let prev = null;
    while (stack.length) {
      const cand = stack.pop();
      if (cand && !sameLogicalPage(cand, here) && !isSkippableNavUrl(cand)) {
        prev = cand;
        break;
      }
    }
    writeStack(stack);

    if (prev) {
      location.href = prev;
      return;
    }

    fallbackHome();
  }

  function onEsc(e) {
    if (e.key !== 'Escape') return;
    if (e.altKey || e.ctrlKey || e.metaKey) return;

    if (closeOverlays()) {
      e.preventDefault();
      return;
    }

    // Dashboard baş — ESC bilen çykma
    if (isDashboardPath(location.pathname)) return;

    if (isLoginPath(location.pathname)) {
      e.preventDefault();
      location.href = '/';
      return;
    }

    e.preventDefault();
    goBack();
  }

  function bindBackButtons() {
    document.querySelectorAll('#btn-nav-back, [data-nav-back]').forEach((el) => {
      if (el.dataset.navBound) return;
      el.dataset.navBound = '1';
      el.addEventListener('click', (e) => {
        e.preventDefault();
        goBack();
      });
    });
  }

  trackPage();
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
      trackPage();
      bindBackButtons();
    });
  } else {
    bindBackButtons();
  }
  document.addEventListener('keydown', onEsc, true);

  // SPA ýaly tab çalyşanda
  window.addEventListener('popstate', () => {
    setTimeout(trackPage, 0);
  });

  window.EscNav = {
    goBack,
    closeOverlays,
    trackPage,
    bindBackButtons,
    onDashboardTab,
    currentKey,
  };
})();
