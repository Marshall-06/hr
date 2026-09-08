/**
 * Kerwen — ekran ölçegi.
 * Hiç haçan kiçeltmeýär. Öňki zoom/cache arassalanýar.
 */
(function () {
  function forceNormalSize() {
    const root = document.documentElement;
    try {
      root.style.setProperty('zoom', '1', 'important');
    } catch (_) {
      root.style.zoom = '1';
    }
    root.style.removeProperty('--ui-fit-scale');
    root.classList.remove('ui-fit-transform');
    root.style.setProperty('--ui-scale', '1');
    root.dataset.uiScale = '1';
    if (document.body) {
      document.body.style.removeProperty('transform');
      document.body.style.removeProperty('transformOrigin');
      document.body.style.removeProperty('width');
      document.body.style.removeProperty('minHeight');
      document.body.style.removeProperty('zoom');
    }
  }

  forceNormalSize();
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', forceNormalSize);
  }
  window.addEventListener('pageshow', forceNormalSize);
  window.addEventListener('load', forceNormalSize);

  window.KerwenFitScreen = {
    apply: forceNormalSize,
    reset: forceNormalSize,
    computeScale: () => 1,
  };
})();
