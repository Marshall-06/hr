/* Çap — brauzer kolonitullary (sene / https://192) bolmaz ýaly Word arkaly */
(function () {
  let savedTitle = '';

  function fallbackUrl() {
    const q = new URLSearchParams(window.location.search);
    const ret = q.get('return');
    if (ret) return ret;
    const anketaId = q.get('anketaId');
    if (anketaId) return `/admin/anketa-view.html?id=${anketaId}`;
    if ((window.Auth && Auth.isLoggedIn()) || sessionStorage.getItem('token')) return '/admin/dashboard.html';
    return '/';
  }

  function goBack() {
    // Çap köplenç täze tab — ilki ýap, soň return / fallback
    try {
      const key = 'kerwen_nav_stack';
      let stack = JSON.parse(sessionStorage.getItem(key) || '[]');
      if (Array.isArray(stack)) {
        stack = stack.filter((u) => !/contract-print|anketa-print|anketa-packet-print|dil-haty-print/i.test(String(u || '')));
        sessionStorage.setItem(key, JSON.stringify(stack));
      }
    } catch { /* ignore */ }

    const ret = new URLSearchParams(window.location.search).get('return');
    if (ret && ret.startsWith('/')) {
      window.close();
      setTimeout(() => {
        if (!window.closed) window.location.href = ret;
      }, 150);
      return;
    }

    window.close();
    setTimeout(() => {
      if (window.closed) return;
      const anketaId = new URLSearchParams(window.location.search).get('anketaId');
      if (anketaId) {
        window.location.href = `/admin/anketa-view.html?id=${anketaId}`;
        return;
      }
      if (window.history.length > 1) {
        const ref = document.referrer || '';
        if (!ref || ref.startsWith(window.location.origin)) {
          window.history.back();
          return;
        }
      }
      window.location.href = fallbackUrl();
    }, 150);
  }

  function tryClose() {
    window.close();
    setTimeout(() => {
      if (!window.closed) goBack();
    }, 200);
  }

  function clearPrintChrome() {
    savedTitle = document.title;
    document.title = '\u00A0';
  }

  function restorePrintChrome() {
    if (savedTitle != null && savedTitle !== undefined) {
      document.title = savedTitle;
    }
  }

  function printRoot() {
    return document.getElementById('packet')
      || document.querySelector('.page')
      || document.getElementById('contract-page')
      || document.getElementById('dil-haty-page')
      || document.getElementById('sheet')
      || document.querySelector('.sheet')
      || null;
  }

  function docFileName(ext) {
    const t = (document.querySelector('.title, .anketa-title, h1')?.textContent || 'dokument')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 60);
    const safe = t.replace(/[\\/:*?"<>|]/g, '').trim() || 'dokument';
    return `${safe}.${ext}`;
  }

  function wordStyles() {
    /* mso-header/footer none — Word çapda sene/URL goşmaz */
    return `
      @page Section1 {
        size: 210mm 297mm;
        margin: 18mm 1cm 18mm 1.5cm;
        mso-header-margin: 0mm;
        mso-footer-margin: 0mm;
        mso-paper-source: 0;
      }
      div.Section1 { page: Section1; }
      body {
        font-family: "Times New Roman", Times, serif;
        font-size: 12pt;
        line-height: 1.35;
        color: #000;
        margin: 0;
      }
      .title {
        text-align: center;
        font-weight: bold;
        font-size: 14pt;
        margin: 0 0 8px;
        text-transform: uppercase;
      }
      .meta-row {
        margin-bottom: 18px;
        font-size: 12pt;
      }
      .meta-row span { display: inline-block; min-width: 40%; }
      .meta-row span:last-child { float: right; text-align: right; }
      .section-title {
        text-align: center;
        font-weight: bold;
        margin: 14px 0 8px;
        text-transform: uppercase;
        font-size: 12pt;
      }
      .p {
        text-align: justify;
        margin: 0 0 8px;
        text-indent: 1.2em;
      }
      .p.numbered, .clause-list li {
        text-indent: 0;
        padding-left: 3.6em;
        position: relative;
        text-align: justify;
        margin: 0 0 6px;
        list-style: none;
      }
      .clause-list { margin: 4px 0 10px; padding: 0; }
      .num {
        position: absolute;
        left: 0;
        top: 0;
        font-weight: 700;
        min-width: 3.2em;
      }
      .section-title.numbered > .num {
        position: static;
        display: inline;
        margin-right: 0.35em;
      }
      .two-cols {
        display: table;
        width: 100%;
        margin-top: 18px;
        border-collapse: separate;
        border-spacing: 24px 0;
      }
      .two-cols .col {
        display: table-cell;
        width: 50%;
        vertical-align: top;
      }
      .col h4 {
        margin: 0 0 10px;
        text-transform: uppercase;
        font-size: 12pt;
        font-weight: 700;
        text-align: center;
      }
      .col p { margin: 0 0 4px; text-indent: 0; }
      .sign-row {
        margin-top: 28px;
        width: 100%;
      }
      .sign-rule {
        display: inline-block;
        width: 55%;
        border-bottom: 1px solid #000;
        vertical-align: bottom;
        height: 1.1em;
      }
      .sign-name {
        display: inline-block;
        margin-left: 8px;
        font-weight: 700;
        white-space: nowrap;
        vertical-align: bottom;
      }
      .x-sign .sign-line {
        display: inline-block;
        width: 120px;
        height: 0;
        margin: 0;
        padding: 0;
        border: 0;
        border-bottom: 1px solid #000;
        vertical-align: baseline;
      }
      .dh-contract-no {
        text-align: center;
        margin: 0 0 10px;
        font-size: 12pt;
      }
      .dh-meta {
        margin: 0 0 14px;
        font-size: 12pt;
      }
      .dh-meta span { display: inline-block; min-width: 40%; }
      .dh-meta span:last-child { float: right; text-align: right; font-weight: 700; }
      .dh-line, .dh-body {
        text-align: justify;
        margin: 0 0 6px;
        text-indent: 0;
        line-height: 1.4;
        font-size: 12pt;
      }
      .dh-section--ynanc { margin-top: 2.5cm; }
      .dh-warning { font-weight: 700; margin: 12px 0 16px; text-align: justify; }
      .dh-sign { margin-top: 18px; }
      .dh-fill { text-decoration: underline; }
      .loading, .no-print { display: none; }
    `;
  }

  function buildWordHtml() {
    const el = printRoot();
    if (!el) return null;
    const content = el.innerHTML;
    return `<!DOCTYPE html>
<html xmlns:o="urn:schemas-microsoft-com:office:office"
 xmlns:w="urn:schemas-microsoft-com:office:word"
 xmlns="http://www.w3.org/TR/REC-html40">
<head>
<meta charset="utf-8">
<meta http-equiv="Content-Type" content="text/html; charset=utf-8">
<!--[if gte mso 9]><xml>
 <o:DocumentProperties><o:Title></o:Title></o:DocumentProperties>
 <w:WordDocument>
  <w:View>Print</w:View>
  <w:Zoom>100</w:Zoom>
  <w:DoNotOptimizeForBrowser/>
  <w:DisplayHorizontalDrawingGridEvery>0</w:DisplayHorizontalDrawingGridEvery>
  <w:DisplayVerticalDrawingGridEvery>0</w:DisplayVerticalDrawingGridEvery>
 </w:WordDocument>
</xml><![endif]-->
<style>
${wordStyles()}
</style>
</head>
<body lang="TK">
<!--[if gte mso 9]><xml>
 <w:WordDocument><w:View>Print</w:View></w:WordDocument>
</xml><![endif]-->
<div class="Section1">
${content}
</div>
</body>
</html>`;
  }

  function makeWordBlob() {
    const html = buildWordHtml();
    if (!html) return null;
    return new Blob(['\ufeff', html], { type: 'application/msword;charset=utf-8' });
  }

  function downloadBlob(blob, name) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = name;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 8000);
    return url;
  }

  function downloadWord() {
    const blob = makeWordBlob();
    if (!blob) {
      alert('Mazmun tapylmady');
      return;
    }
    downloadBlob(blob, docFileName('doc'));
  }

  /** Esasy: şol sahypada göni çap (tartipli, goşmaça penjire ýok) */
  function printAsPreview() {
    clearPrintChrome();
    const prev = location.href;
    try { history.replaceState({}, '', '/'); } catch (_) { /* ignore */ }
    window.print();
    setTimeout(() => {
      restorePrintChrome();
      try { history.replaceState({}, '', prev); } catch (_) { /* ignore */ }
    }, 600);
  }

  function bind() {
    document.querySelectorAll('[data-print-back]').forEach((el) => {
      el.addEventListener('click', (e) => {
        e.preventDefault();
        goBack();
      });
    });
    document.querySelectorAll('[data-print-close]').forEach((el) => {
      el.addEventListener('click', (e) => {
        e.preventDefault();
        tryClose();
      });
    });
    document.querySelectorAll('[data-print-do]').forEach((el) => {
      el.addEventListener('click', (e) => {
        e.preventDefault();
        printAsPreview();
      });
    });
    document.querySelectorAll('[data-print-word]').forEach((el) => {
      el.addEventListener('click', (e) => {
        e.preventDefault();
        downloadWord();
      });
    });
    document.querySelectorAll('[data-print-pdf]').forEach((el) => {
      el.addEventListener('click', (e) => {
        e.preventDefault();
        downloadWord();
      });
    });
    document.querySelectorAll('[data-print-browser]').forEach((el) => {
      el.addEventListener('click', (e) => {
        e.preventDefault();
        printAsPreview();
      });
    });

    window.addEventListener('beforeprint', clearPrintChrome);
    window.addEventListener('afterprint', restorePrintChrome);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', bind);
  } else {
    bind();
  }

  window.PrintNav = {
    goBack,
    tryClose,
    fallbackUrl,
    printAsPreview,
    printClean: printAsPreview,
    printViaWord: downloadWord,
    downloadWord,
    clearPrintChrome,
    restorePrintChrome,
  };
})();
