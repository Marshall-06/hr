function escDil(v) {
  return String(v ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** Boş meýdan — Word şablonyndaky çyzyk ýaly */
function blank(min = 12) {
  return `<span class="dh-blank">${'_'.repeat(min)}</span>`;
}

/** Maglumat ýa-da boş çyzyk */
function fill(text, min = 12) {
  const t = String(text || '').trim();
  if (!t) return blank(min);
  return `<span class="dh-fill">${escDil(t)}</span>`;
}

function partOrBlank(val) {
  const t = String(val || '').trim();
  return t ? escDil(t) : '___';
}

/** Dil haty + Ynanç haty — bir sahypada, Word şablony ýaly */
function renderDilHatyPrintHtml(d) {
  const esc = escDil;
  const agency = esc(d.agencyShort || '"Täjir Kerweni" H.J.');
  const c1 = partOrBlank(d.contractPart1);
  const c2 = partOrBlank(d.contractPart2);
  const c3 = partOrBlank(d.contractPart3);
  const feePct = esc(d.feePercent || 50);
  const dirPass = `${esc(d.directorPassportSeries || 'I-AH')} №${esc(d.directorPassportNumber || '089111')} ${esc(d.directorPassportDate || '17.11.1999')} senesinde ${esc(d.directorPassportIssuedBy || 'Ahal wel. Gäwers etr. PB.')} tarapyndan berilen ${esc(d.directorName || 'Gurbanow Omar Baýramgeldiýewiç')}e`;

  return `
    <p class="dh-contract-no">ŞERTNAMA ${c1} / ${c2} / ${c3} goşundy</p>

    <section class="dh-section">
      <h1 class="title">DIL HATY</h1>

      <div class="dh-meta">
        <span>ş. Aşgabat</span>
        <span class="dh-date">«${esc(d.docDay || '___')}» ${esc(d.docMonth || '___________')} ${esc(d.docYear || '202__')} ý.</span>
      </div>

      <p class="dh-line">Men, ${fill(d.fullName, 52)}</p>

      <p class="dh-line">
        Pasport seriýa ${fill(d.passportSeries, 8)} № ${fill(d.passportNumber, 12)}
        kim tarapyndan berildi ${fill(d.passportIssuedBy, 20)}
      </p>

      <p class="dh-line">
        berilen wagty ${fill(d.passportIssuedDate, 12)} ýazgyda duran ýeri :
        ${fill(d.registrationAddress, 24)}
      </p>

      <p class="dh-line">Häzirki ýaşaýan ýeri ${fill(d.currentAddress, 44)}</p>

      <p class="dh-line dh-body">
        ${agency} Kadrlar Agentliginden şertnama № ${c1} / ${c2} / ${c3} boýunça
        «${esc(d.workDay || '___')}» ${esc(d.workMonth || '___________')} ${esc(d.workYear || '202__')} ý. senesinde
        ${fill(d.companyName, 22)} kärhanasyna ${fill(d.position, 22)} wezipesine işe ýerleşdim.
        Aýlyk hakym ${fill(d.salary, 10)} manat.
      </p>

      <p class="dh-line">(ýazgy bilen) ${fill(d.salaryWords, 40)}</p>

      <p class="dh-line dh-body">
        ${agency} Kadrlar Agentligine şertnamanyň 4.1. bendine laýyklykda hyzmaty üçin aýlygymyň ${feePct}%-ni
        ýagny ${fill(d.feeDisplay, 12)} manadyny tölemäge borçlanýaryn.
      </p>

      <p class="dh-line">(ýazgy bilen) ${fill(d.feeWords, 40)}</p>

      <p class="dh-warning">
        Tölegi tölemekden ýüz döndüren ýagdaýymda Suda ýüz tutuljaklygy barada duýduryldym.
      </p>

      <p class="dh-sign">
        F.A.A. ${blank(28)}&nbsp;&nbsp;&nbsp;goly ${blank(20)}
      </p>
    </section>

    <section class="dh-section dh-section--ynanc">
      <h1 class="title">YNANÇ HATY</h1>

      <div class="dh-meta">
        <span>ş. Aşgabat</span>
        <span class="dh-date">«${esc(d.docDay || '___')}» ${esc(d.docMonth || '___________')} ${esc(d.docYear || '202__')} ý.</span>
      </div>

      <p class="dh-line dh-body">
        № ${c1} / ${c2} / ${c3} belgili şertnama laýyklykda ${agency} Kadrlar Agentliginiň hyzmatlary üçin
        aýlyk hakynyň ${feePct}%-ni almak üçin ynanç haty.
      </p>

      <p class="dh-line">Men, ${fill(d.fullName, 52)}</p>

      <p class="dh-line dh-body">
        ${agency} Kadrlar Agentliginiň direktory pasport seriýa ${dirPass},
        ${fill(d.agencyAddress, 28)} salgyda ýerleşýän,
        ${fill(d.companyName, 22)} kärhanasynyň kassasyndan maňa hasaplanan aýlygyň ${feePct}%-ni almaga ynanýaryn.
      </p>

      <p class="dh-line">
        Ýnanç hatynyň möhleti «${esc(d.validDay || '___')}» ${esc(d.validMonth || '___________')} ${esc(d.validYear || '202__')} ý çenli hereket edýär.
      </p>

      <p class="dh-sign">
        Ýnanç hatyny bereniň: F.A.A. ${blank(24)}&nbsp;&nbsp;&nbsp;goly ${blank(16)}
      </p>
    </section>
  `;
}

window.renderDilHatyPrintHtml = renderDilHatyPrintHtml;

(async function loadDilHaty() {
  if (!/dil-haty-print\.html/i.test(window.location.pathname || '')) return;

  if (!(window.Auth && Auth.isLoggedIn()) && !sessionStorage.getItem('token')) {
    window.location.href = '/admin/login.html';
    return;
  }

  const params = new URLSearchParams(window.location.search);
  const assignmentId = params.get('assignmentId');
  const page = document.getElementById('dil-haty-page');
  if (!page) return;

  if (!assignmentId) {
    page.innerHTML = '<p>Hödürleme ID tapylmady</p>';
    return;
  }

  try {
    const res = await api.get(`/vacancies/assignments/${assignmentId}/dil-haty`);
    page.innerHTML = renderDilHatyPrintHtml(res.data);
    document.title = `Dil haty — ${res.data?.fullName || assignmentId}`;
  } catch (err) {
    page.innerHTML = `<p style="color:red">${escDil(err.message)}</p>`;
  }
})();
