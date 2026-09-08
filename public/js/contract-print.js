function escContract(v) {
  return String(v ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** Şertnama çap HTML (aýratyn sahypa we paket üçin) */
function renderContractPrintHtml(d) {
  const esc = escContract;
  const fee = d.serviceFeePercent || 50;
  const anketaNo = esc(d.anketaNumber || '');
  const name = esc(d.jobSeekerName || '');
  const executor = esc(d.executorName || '');
  const director = esc(d.executorDirector || '');

  const monthNames = [
    'Ýanwar', 'Fewral', 'Mart', 'Aprel', 'Maý', 'Iýun',
    'Iýul', 'Awgust', 'Sentýabr', 'Oktýabr', 'Noýabr', 'Dekabr',
  ];
  const now = new Date();
  const day = d.day || now.getDate();
  const month = d.month || monthNames[now.getMonth()];
  const year = d.year || now.getFullYear();

  return `
      <h1 class="title">ŞERTNAMA № ${esc(d.contractNumber || '')}</h1>
      <div class="meta-row">
        <span>ş. ${esc(d.city || 'Aşgabat')}</span>
        <span class="contract-date">${esc(day)} ${esc(month)} ${esc(year)} ý.</span>
      </div>

      <h2 class="section-title numbered"><span class="num">1.</span> ŞERTNAMANYŇ TARAPLARY</h2>
      <p class="p numbered"><span class="num">1.1.</span>
        Bir tarapdan ustaw esasynda hereket edýän ${executor},
        direktory ${director}iň wekilçiliginde mundan beýläk
        <strong>«Ýerine ýetiriji»</strong> diýilip atlandyryljak we beýleki tarapdan raýat
        <strong>${name}</strong> mundan beýläk
        <strong>«Iş gözleýiji»</strong> diýilip atlandyryljak, ikisi bilelikde bolsa
        <strong>«Taraplar»</strong> diýilip atlandyryljaklar öz aralarynda şu aşakdakylar hakynda şertnama baglaşdylar.
      </p>

      <h2 class="section-title numbered"><span class="num">2.</span> ŞERTNAMANYŇ MAZMUNY</h2>
      <p class="p numbered"><span class="num">2.1.</span>
        Iş gözleýiji işe ýerleşmek maksady bilen öz dolduran anketasyndaky maglumatlara we talaplara
        laýyk gelýän wezipäni gözläp tapyp bermek hyzmatyny Ýerine ýetirije tabşyrýar.
      </p>
      <p class="p numbered"><span class="num">2.2.</span>
        Ýerine ýetiriji bolsa şu şertnamanyň aýrylmaz bölegi bolup durýan Iş gözleýijiniň
        № <strong>${anketaNo}</strong> anketasyna laýyklykda şol wezipä gabat gelýän
        elinde bar bolan boş iş orunlaryny hödürlemäge borçlanyar.
      </p>

      <h2 class="section-title numbered"><span class="num">3.</span> TARAPLARYŇ HUKUKLARY WE BORÇLARY</h2>
      <p class="p numbered"><span class="num">3.1.</span>
        <strong>Ýerine ýetiriji şu aşakdaky hyzmatlary ýerine ýetirmäge borçlanyar:</strong>
      </p>
      <ol class="clause-list">
        <li><span class="num">3.1.1.</span>Iş gözleýijiniň anketa maglumatlaryny öz iş gözleýijileriniň bazasyna ýerleşdirmäge;</li>
        <li><span class="num">3.1.2.</span>Iş berijileriň talaplaryna laýyklykda Iş gözleýijiniň anketa maglumatlaryny olara bermäge;</li>
        <li><span class="num">3.1.3.</span>Iş berijilerden başga üçünji tarapa Iş gözleýijiniň anketa maglumatlaryny aýan etmezlige;</li>
        <li><span class="num">3.1.4.</span>Iş gözleýijini bar bolan boş iş orunlary bilen habarly etmäge;</li>
        <li><span class="num">3.1.5.</span>Iş gözleýijini potensial Iş berijiler bilen iş söhbetdeşligini geçirmek üçin düşürmäge.</li>
      </ol>

      <p class="p numbered"><span class="num">3.2.</span>
        <strong>Ýerine ýetirijiniň hukuklary:</strong>
      </p>
      <ol class="clause-list">
        <li><span class="num">3.2.1.</span>Iş gözleýijiniň anketadaky görkezen maglumatlarynyň dogrulygy barlamaga;</li>
        <li><span class="num">3.2.2.</span>Iş gözleýijiden geçirilen iş söhbetdeşliginiň netijesini öwrenmäge;</li>
        <li><span class="num">3.2.3.</span>Iş gözleýijiniň şu şertnamadan ýüze çykýan borçlaryny ýerine ýetirmekden boýun gaçyrsa şertnamany bir taraplaýyn ýatyrmaga.</li>
      </ol>

      <p class="p numbered"><span class="num">3.3.</span>
        <strong>Iş gözleýiji şu aşakdakylar bilen borçlanyar:</strong>
      </p>
      <ol class="clause-list">
        <li><span class="num">3.3.1.</span>Özi, bilimi we hünäri, işlän ýerleri barada doly we dogry maglumatlary bermäge;</li>
        <li><span class="num">3.3.2.</span>Potensial iş berijiniň iş söhbetdeşligine wagtynda barmaga;</li>
        <li><span class="num">3.3.3.</span>Söhbetdeşligiň netijesinde işe ýerleşendigi ýa-da ýerleşmändigi barada habar bermäge;</li>
        <li><span class="num">3.3.4.</span>Işe ýerleşen ýagdaýynda 3 günüň dowamynda gelip şu şertnama goşunda gol çekmäge;</li>
        <li><span class="num">3.3.5.</span>Işe ýerleşen ýagdaýynda şu şertnamanyň 4.1. bendine laýyklykda Ýerine ýetirije ýerine ýetirilen hyzmatyň tölegini tölemäge.</li>
      </ol>

      <p class="p numbered"><span class="num">3.4.</span>
        <strong>Iş gözleýijiniň hukuklary:</strong>
      </p>
      <ol class="clause-list">
        <li><span class="num">3.4.1.</span>Işe ýerleşmek üçin tabşyran işleriniň we hyzmatlarynyň gidişi barada maglumat almaga.</li>
      </ol>

      <h2 class="section-title numbered"><span class="num">4.</span> HYZMATLARYŇ TÖLEGI WE HASAPLAŞYKLAR</h2>
      <p class="p numbered"><span class="num">4.1.</span>
        Ýerine ýetirijiniň hyzmatlarynyň tölegi Iş gözleýijiniň işe ýerleşen wezipesiniň Iş beriji tarapyndan
        bellenen bir aýlyk zähmet hakynyň <strong>${fee}%</strong>-ne deňdir.
      </p>
      <p class="p numbered"><span class="num">4.2.</span>
        Iş gözleýiji hyzmatlaryň tölegini birinji aýlyk hakyny alan gününden soň 3 günüň dowamynda tölemäge borçlanyar.
      </p>
      <p class="p numbered"><span class="num">4.3.</span>
        Eger Iş gözleýiji işe ýerleşenden soň bir aýyny doly işleman çykan bolsa, onda jemi işlän günleri üçin
        hasaplanan aýlyk hakyndan ${fee}%-ni tölemäge borçlanyar.
      </p>
      <p class="p numbered"><span class="num">4.4.</span>
        Eger Iş gözleýiji Ýerine ýetirijiniň ugradan wezipesi boýunça däl-de, Iş berijiniň teklip eden başga wezipesi
        boýunça işe ýerleşen bolsa onda ýerleşen wezipesine garamazdan şu şertnamanyň 4.1. bendine laýyklykda
        ýerine ýetirilen hyzmatyň tölegini tölemäge borçlanyar.
      </p>

      <h2 class="section-title numbered"><span class="num">5.</span> ÝÜZE ÇYKAN JEDELLERIŇ ÇÖZGÜDI</h2>
      <p class="p numbered"><span class="num">5.1.</span>
        Eger Iş gözleýiji şu şertnamanyň 4.1. bendine laýyklykda tölegini tölemekden ýüz dönderen ýagdaýynda
        Iş beriji onuň aýlyk zähmet hakyndan ${fee}%-ni tutup alyp galmaga hukugy bardyr ýa-da suda ýüz tutulýar.
      </p>
      <p class="p numbered"><span class="num">5.2.</span>
        Taraplar şu şertnama boýunça başga ýüze çykan jedelleri öz aralarynda gepleşikler we düşünişmek arkaly çözmäge synanyşarlar.
      </p>
      <p class="p numbered"><span class="num">5.3.</span>
        Eger jedeller gepleşikler we düşünişmek arkaly çözülip bilmese onda Türkmenistanyň Kanunçylygyna laýyklykda hereket edilýär.
      </p>

      <h2 class="section-title numbered"><span class="num">6.</span> ŞERTNAMANYŇ MÖHLETI WE ÝATYRYLMAGYNYŇ TERTIBI</h2>
      <p class="p numbered"><span class="num">6.1.</span>
        Şu şertnama taraplaryň gol çeken gününden başlap güýje girýär.
      </p>
      <p class="p numbered"><span class="num">6.2.</span>
        Şertnamanyň möhleti Iş gözleýiji Ýerine ýetirijiniň tapyp beren işine ýerleşip şu şertnamanyň 4.1. bendine
        laýyklykda ýerine ýetirilen hyzmatyň tölegini töläninden soňra tamamlanýar.
      </p>
      <p class="p numbered"><span class="num">6.3.</span>
        Şu şertnama Taraplar üçin ýuridiki güýji deň bolan iki nusgada, türkmen dilinde taýýarlanyldy.
      </p>

      <h2 class="section-title numbered"><span class="num">7.</span> TARAPLARYŇ REKWIZITLARY WE GOLLARI</h2>
      <div class="two-cols">
        <div class="col">
          <h4>ÝERINE ÝETIRIJI:</h4>
          <p>${esc(d.company?.name || d.executorName || '')}</p>
          <p>${esc(d.company?.address || '')}</p>
          <p>${esc(d.company?.bank || '')}</p>
          <p>H/H: ${esc(d.company?.account || '')}</p>
          <p>MFO: ${esc(d.company?.mfo || '')}</p>
          <p>SSB: ${esc(d.company?.ssb || '')}</p>
          <p>Tel: ${esc(d.company?.phone || '')}</p>
          <p>E-mail: ${esc(d.company?.email || '')}</p>
          <div class="sign-row">
            <span class="sign-rule" aria-hidden="true"></span>
            <span class="sign-name">${esc(d.executorDirectorShort || d.executorDirector || '')}</span>
          </div>
        </div>
        <div class="col">
          <h4>IŞ GÖZLEÝIJI:</h4>
          <p>Familiýasy: ${esc(d.familyName || '')}</p>
          <p>Ady: ${esc(d.firstName || '')}</p>
          <p>Atasynyň ady: ${esc(d.patronymic || '')}</p>
          <p><strong>Pasport:</strong> ${esc(d.passportNumber || '________________')} ${esc(d.passportIssued || '')}</p>
          <p>Adres: ${esc(d.address || '')}</p>
          <p>Tel: ${esc(d.phone || '')}</p>
          <div class="sign-row">
            <span class="sign-rule" aria-hidden="true"></span>
            <span class="sign-name">${esc(d.shortName || d.jobSeekerName || '')}</span>
          </div>
        </div>
      </div>
    `;
}

window.renderContractPrintHtml = renderContractPrintHtml;

(async function loadContract() {
  if (!/contract-print\.html/i.test(window.location.pathname || '')) return;

  if (!(window.Auth && Auth.isLoggedIn()) && !sessionStorage.getItem('token')) {
    window.location.href = '/admin/login.html';
    return;
  }

  const params = new URLSearchParams(window.location.search);
  const id = params.get('id');
  const page = document.getElementById('contract-page');
  if (!page) return;

  if (!id) {
    page.innerHTML = '<p>Şertnama ID tapylmady</p>';
    return;
  }

  try {
    const res = await api.get(`/contracts/${id}/print`);
    page.innerHTML = renderContractPrintHtml(res.data);
    document.title = `Şertnama № ${res.data?.contractNumber || id}`;
  } catch (err) {
    page.innerHTML = `<p style="color:red">${escContract(err.message)}</p>`;
  }
})();
