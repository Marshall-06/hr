/**
 * Bir anketa sahypasyndan e-poçta ugratmak (deňeşdirme bilen birmeňzeş).
 */
(function initAnketaMail(global) {
  let mailVacanciesCache = [];

  function escHtml(v) {
    return String(v ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function ensureModal() {
    let modal = document.getElementById('anketa-mail-modal');
    if (modal) return modal;
    modal = document.createElement('div');
    modal.id = 'anketa-mail-modal';
    modal.className = 'modal-overlay hidden';
    modal.setAttribute('aria-hidden', 'true');
    modal.innerHTML = '<div class="modal-panel" style="max-width:560px;width:100%"><div class="modal-body" id="anketa-mail-body"></div></div>';
    modal.addEventListener('click', (e) => {
      if (e.target === modal) closeModal();
    });
    document.body.appendChild(modal);
    return modal;
  }

  function closeModal() {
    const modal = document.getElementById('anketa-mail-modal');
    if (!modal) return;
    modal.classList.add('hidden');
    modal.style.display = 'none';
    modal.setAttribute('aria-hidden', 'true');
  }

  function showModal(html) {
    const modal = ensureModal();
    const body = document.getElementById('anketa-mail-body');
    if (body) body.innerHTML = html;
    modal.classList.remove('hidden');
    modal.style.display = 'flex';
    modal.setAttribute('aria-hidden', 'false');
  }

  function pushEmails(target, raw) {
    if (raw == null || raw === '') return;
    if (Array.isArray(raw)) {
      raw.forEach((x) => pushEmails(target, x));
      return;
    }
    String(raw)
      .split(/[,;/|\n]+/)
      .map((s) => s.trim())
      .filter(Boolean)
      .forEach((e) => target.push(e));
  }

  function normalizeEmails(list) {
    const seen = new Set();
    return (list || []).filter((e) => {
      const key = String(e || '').trim().toLowerCase();
      if (!key.includes('@') || key === 'null' || seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }

  /** Excel → extraData.email; forma → contactEmail / contactEmails */
  function extractVacancyContacts(v) {
    if (!v) return { emails: [], names: [], phones: [] };
    const extra = v.extraData && typeof v.extraData === 'object' ? v.extraData : {};
    const emails = [];
    let names = Array.isArray(extra.contactNames) ? extra.contactNames.slice() : [];
    let phones = Array.isArray(extra.contactPhones) ? extra.contactPhones.slice() : [];

    pushEmails(emails, extra.contactEmails);
    pushEmails(emails, extra.email);
    pushEmails(emails, v.contactEmail);
    if (Array.isArray(extra.contacts)) {
      extra.contacts.forEach((c) => {
        if (c?.name) names.push(c.name);
        if (c?.phone) phones.push(c.phone);
        pushEmails(emails, c?.email);
      });
    }
    if (!names.length) {
      names = String(v.contactName || '').split(/\r?\n+/).map((s) => s.trim()).filter(Boolean);
    }
    if (!phones.length) {
      phones = String(v.contactPhone || '').split(/[,;/|\n]+/).map((s) => s.trim()).filter(Boolean);
    }

    return { emails: normalizeEmails(emails), names, phones };
  }

  /** Şol firmanyň başga wakansiýalaryndan e-poçta (şu wakansiýada ýok bolsa) */
  function companyEmailsFallback(companyName, excludeVacId) {
    const co = String(companyName || '').trim().toLowerCase();
    if (!co) return [];
    const emails = [];
    mailVacanciesCache.forEach((v) => {
      if (Number(v.id) === Number(excludeVacId)) return;
      if ((String(v.companyName || '').trim().toLowerCase()) !== co) return;
      pushEmails(emails, extractVacancyContacts(v).emails);
    });
    return normalizeEmails(emails);
  }

  function vacancyOptionLabel(v) {
    const d = typeof formatDate === 'function' ? formatDate(v.vacancyDate) : '';
    const datePart = d ? ` · ${d}` : '';
    const pos = v.position || '—';
    const co = v.companyName || '';
    return `№${v.vacancyNumber || v.id}${datePart} — ${pos}${co ? ` (${co})` : ''}`;
  }

  function companiesFromVacancies(items) {
    const map = new Map();
    items.forEach((v) => {
      const c = String(v.companyName || '').trim() || '—';
      if (!map.has(c)) map.set(c, []);
      map.get(c).push(v);
    });
    return [...map.entries()].sort((a, b) => a[0].localeCompare(b[0], 'tk'));
  }

  function renderCompanyOptions(items, selectedCompany) {
    const companies = companiesFromVacancies(items);
    const opts = [`<option value="">— Ähli firmalar —</option>`];
    companies.forEach(([name]) => {
      const sel = name === selectedCompany ? ' selected' : '';
      opts.push(`<option value="${escHtml(name)}"${sel}>${escHtml(name)}</option>`);
    });
    return opts.join('');
  }

  function renderVacancyOptions(items, company, selectedVacId) {
    const filtered = company
      ? items.filter((v) => (String(v.companyName || '').trim() || '—') === company)
      : items;
    const sorted = filtered.slice().sort((a, b) => {
      const na = Number(a.vacancyNumber) || a.id;
      const nb = Number(b.vacancyNumber) || b.id;
      return nb - na;
    });
    if (!sorted.length) {
      return `<option value="">Wakansiýa ýok</option>`;
    }
    return sorted.map((v) => {
      const sel = Number(v.id) === Number(selectedVacId) ? ' selected' : '';
      return `<option value="${v.id}"${sel}>${escHtml(vacancyOptionLabel(v))}</option>`;
    }).join('');
  }

  function updateJogapkarHint(v, emails) {
    const hint = document.getElementById('anketa-mail-jogapkar-hint');
    if (!hint) return;
    if (!v) {
      hint.textContent = '';
      hint.hidden = true;
      return;
    }
    const { names } = extractVacancyContacts(v);
    const mailList = Array.isArray(emails) ? emails : extractVacancyContacts(v).emails;
    const parts = [];
    if (names.length) parts.push(`<strong>Jogapkär:</strong> ${escHtml(names.join(', '))}`);
    if (mailList.length) {
      parts.push(`<strong>E-poçta:</strong> ${escHtml(mailList.join(', '))}`);
      hint.style.color = '#1a7f4b';
    } else {
      parts.push('<strong>E-poçta:</strong> <span style="color:#9b3d3d">bazada ýok — el bilen ýazyň</span>');
      hint.style.color = '#555';
    }
    hint.innerHTML = parts.join('<br>');
    hint.hidden = false;
  }

  function setEmailPickVisible(emailPick, visible) {
    if (!emailPick) return;
    emailPick.hidden = !visible;
    emailPick.classList.toggle('hidden', !visible);
  }

  function applyVacancyToForm(vacId, { keepEmail = false } = {}) {
    const id = Number(vacId) || 0;
    const v = mailVacanciesCache.find((x) => Number(x.id) === id) || null;
    const toInput = document.getElementById('anketa-mail-to');
    const emailPick = document.getElementById('anketa-mail-email-pick');

    if (!v) {
      updateJogapkarHint(null);
      setEmailPickVisible(emailPick, false);
      if (emailPick) emailPick.innerHTML = '';
      return null;
    }

    let { emails } = extractVacancyContacts(v);
    if (!emails.length) {
      emails = companyEmailsFallback(v.companyName, v.id);
    }

    updateJogapkarHint(v, emails);

    if (emailPick) {
      if (emails.length > 1) {
        setEmailPickVisible(emailPick, true);
        emailPick.innerHTML = emails.map((e, i) => (
          `<option value="${escHtml(e)}">${escHtml(`${i + 1}. ${e}`)}</option>`
        )).join('')
          + `<option value="${escHtml(emails.join(', '))}">Ählisi (${emails.length})</option>`;
        emailPick.onchange = () => {
          if (toInput && emailPick.value) toInput.value = emailPick.value;
        };
        if (!keepEmail && toInput) toInput.value = emails[0];
        emailPick.value = emails[0];
      } else {
        setEmailPickVisible(emailPick, false);
        emailPick.innerHTML = '';
        if (!keepEmail && toInput) toInput.value = emails[0] || '';
      }
    } else if (!keepEmail && toInput) {
      toInput.value = emails[0] || emails.join(', ') || '';
    }

    return v;
  }

  function onMailCompanyChange() {
    const company = document.getElementById('anketa-mail-company')?.value || '';
    const vacSel = document.getElementById('anketa-mail-vacancy');
    if (!vacSel) return;
    const prev = Number(vacSel.value) || 0;
    const filtered = company
      ? mailVacanciesCache.filter((v) => (String(v.companyName || '').trim() || '—') === company)
      : mailVacanciesCache;
    const stillThere = filtered.some((v) => Number(v.id) === prev);
    const nextId = stillThere ? prev : (filtered[0]?.id || '');
    vacSel.innerHTML = renderVacancyOptions(mailVacanciesCache, company, nextId);
    applyVacancyToForm(nextId);
  }

  async function onMailVacancyChange() {
    const vacId = document.getElementById('anketa-mail-vacancy')?.value;
    const id = Number(vacId) || 0;
    // Doly maglumat (extraData.email) — sanawda ýeterlik bolmasa täzeden al
    if (id) {
      const cached = mailVacanciesCache.find((x) => Number(x.id) === id);
      const hasMail = cached && extractVacancyContacts(cached).emails.length;
      if (!hasMail) {
        try {
          const res = await api.get(`/vacancies/${id}`);
          if (res.data) {
            const idx = mailVacanciesCache.findIndex((x) => Number(x.id) === id);
            if (idx >= 0) mailVacanciesCache[idx] = res.data;
            else mailVacanciesCache.push(res.data);
          }
        } catch { /* ignore */ }
      }
    }
    const v = applyVacancyToForm(vacId);
    const companySel = document.getElementById('anketa-mail-company');
    if (v && companySel && !companySel.value) {
      const co = String(v.companyName || '').trim() || '—';
      const opt = [...companySel.options].find((o) => o.value === co);
      if (opt) companySel.value = co;
    }
  }

  async function loadMailVacancies(preferredVacId) {
    try {
      const res = await api.get('/vacancies?status=Acyk&limit=200');
      mailVacanciesCache = res.data.items || [];
    } catch {
      mailVacanciesCache = [];
    }

    const prefId = Number(preferredVacId) || 0;
    if (prefId && !mailVacanciesCache.some((v) => Number(v.id) === prefId)) {
      try {
        const one = await api.get(`/vacancies/${prefId}`);
        if (one.data) mailVacanciesCache.unshift(one.data);
      } catch { /* ignore */ }
    }

    return mailVacanciesCache;
  }

  async function initVacancyPicker(opts = {}) {
    const prefId = Number(opts.vacancyId) || 0;
    const companySel = document.getElementById('anketa-mail-company');
    const vacSel = document.getElementById('anketa-mail-vacancy');
    if (!companySel || !vacSel) return;

    companySel.disabled = true;
    vacSel.disabled = true;
    vacSel.innerHTML = '<option value="">Ýüklenýär...</option>';

    await loadMailVacancies(prefId);

    let prefVac = prefId ? mailVacanciesCache.find((v) => Number(v.id) === prefId) : null;
    if (!prefVac && prefId) {
      try {
        const one = await api.get(`/vacancies/${prefId}`);
        prefVac = one.data;
        if (prefVac) mailVacanciesCache.unshift(prefVac);
      } catch { /* ignore */ }
    }

    const company = prefVac
      ? (String(prefVac.companyName || '').trim() || '—')
      : '';

    companySel.innerHTML = renderCompanyOptions(mailVacanciesCache, company);
    companySel.value = company;
    vacSel.innerHTML = renderVacancyOptions(mailVacanciesCache, company, prefVac?.id || '');
    if (prefVac?.id) vacSel.value = String(prefVac.id);

    companySel.disabled = false;
    vacSel.disabled = false;

    companySel.onchange = onMailCompanyChange;
    vacSel.onchange = onMailVacancyChange;

    const defaultEmail = String(opts.defaultEmail || '').trim();
    if (prefVac?.id) {
      applyVacancyToForm(prefVac.id, { keepEmail: Boolean(defaultEmail) });
      if (defaultEmail) {
        const toInput = document.getElementById('anketa-mail-to');
        if (toInput) toInput.value = defaultEmail;
      }
    } else if (mailVacanciesCache.length === 1) {
      vacSel.value = String(mailVacanciesCache[0].id);
      applyVacancyToForm(mailVacanciesCache[0].id);
    } else {
      updateJogapkarHint(null);
    }
  }

  async function mailApiGet(path) {
    try {
      return await api.get(path);
    } catch (e) {
      if (e.status === 404 && path === '/mail/status') {
        return api.get('/vacancies/mail-status');
      }
      throw e;
    }
  }

  async function refreshMailStatus() {
    const el = document.getElementById('anketa-mail-status');
    const setup = document.getElementById('anketa-mail-setup');
    const hint = document.getElementById('anketa-mail-setup-hint');
    const passWrap = document.getElementById('anketa-mail-pass-wrap');
    const gmailUser = document.getElementById('anketa-mail-user');
    try {
      const res = await mailApiGet('/mail/status');
      const st = res.data || {};
      if (!el) return st;
      if (st.enabled || st.ready) {
        el.style.color = '#1a7f4b';
        el.textContent = 'Taýýar — wakansiýa saýlaň, alyjy awtomatik doldurylar';
        setup?.classList.add('hidden');
        return st;
      }
      if (st.hasPass || st.missingUser) {
        el.style.color = '#7a4a00';
        el.textContent = 'App Password saklanan — Admin Sazlamalar → Poçta-da Gmail ýazyň';
        setup?.classList.add('hidden');
        if (hint) hint.textContent = 'Operator Gmail üýtgetmeli däl — admin sazlamaly.';
        passWrap?.classList.add('hidden');
        if (gmailUser && !gmailUser.value) gmailUser.value = st.defaultUser || '';
        return st;
      }
      el.style.color = '#9b3d3d';
      el.textContent = 'Poçta taýýar däl — Admin: Sazlamalar → Poçta';
      setup?.classList.add('hidden');
      if (hint) hint.textContent = 'Gmail adresine harp goşmaň/aýyrmaň. Admin App Password saklamaly.';
      passWrap?.classList.add('hidden');
      return st;
    } catch (e) {
      if (el) {
        el.style.color = '#9b3d3d';
        el.textContent = e.message || 'Poçta ýagdaýy alynmady';
      }
      setup?.classList.add('hidden');
      return {};
    }
  }

  async function ensureMailReady() {
    let st = {};
    try {
      st = (await mailApiGet('/mail/status')).data || {};
    } catch (e) {
      if (e.status === 404 || /tapylmady|not found/i.test(String(e.message || ''))) {
        throw new Error('E-poçta API tapylmady — Main PC-de serweri täzeden başladyň (Gmail-e harp goşmaň)');
      }
      throw e;
    }
    if (st.enabled || st.ready) return true;
    throw new Error('Poçta taýýar däl. Admin: Sazlamalar → Poçta (Gmail + App Password) saklaň.');
  }

  function getSelectedVacancyId() {
    const raw = document.getElementById('anketa-mail-vacancy')?.value;
    const id = Number(raw);
    return id > 0 ? id : null;
  }

  async function confirmSend(anketaId, vacancyId) {
    const to = String(document.getElementById('anketa-mail-to')?.value || '').trim();
    if (!to.includes('@')) {
      alert('Alyjy e-poçtany ýazyň ýa-da wakansiýa saýlap jogapkär e-poçtasyny alyň');
      document.getElementById('anketa-mail-to')?.focus();
      return;
    }
    const vacId = getSelectedVacancyId() || (Number(vacancyId) > 0 ? Number(vacancyId) : null);
    const note = String(document.getElementById('anketa-mail-note')?.value || '').trim();
    const btn = document.getElementById('btn-anketa-mail-send');
    if (btn) {
      btn.disabled = true;
      btn.textContent = 'Ugradylýar...';
    }
    try {
      await ensureMailReady();
      const body = { to, note };
      if (vacId) body.vacancyId = vacId;
      const res = await api.post(`/anketas/${anketaId}/send-email`, body, { timeoutMs: 300000 });
      closeModal();
      const d = res.data || {};
      const box = document.getElementById('alert-box');
      const msg = `Anketa JPG surat bilen ugradyldy → ${d.contactEmail || to}`;
      if (box && typeof showAlert === 'function') showAlert(box, msg, 'success');
      else alert(msg);
    } catch (e) {
      const msg = String(e.message || 'Ugradylmady');
      if (/tapylmady|not found|404/i.test(msg)) {
        alert(`${msg}\n\nGmail adresine harp goşmaň. Main PC-de serweri restart + brauzerde Ctrl+F5.`);
      } else {
        alert(msg);
      }
      await refreshMailStatus();
    } finally {
      if (btn) {
        btn.disabled = false;
        btn.textContent = 'Ugrat';
      }
    }
  }

  function openAnketaEmailModal(anketa, opts = {}) {
    if (!anketa?.id) return;
    const name = [anketa.familyName, anketa.firstName, anketa.patronymic].filter(Boolean).join(' ');
    const vacId = Number(opts.vacancyId) || 0;
    const emailPrefill = String(opts.defaultEmail || '').trim();

    showModal(`
      <h3 style="margin:0 0 6px">E-poçta ugrat</h3>
      <p style="margin:0 0 10px">
        <strong>№ ${escHtml(anketa.anketaNumber || anketa.id)}</strong> — ${escHtml(name)}
        <span class="muted"> (JPG — köne skan ýa-da programma)</span>
      </p>
      <p id="anketa-mail-status" class="muted" style="margin:0 0 10px;font-size:12px"></p>
      <div id="anketa-mail-setup" class="hidden" style="margin:0 0 12px;padding:12px;border:1px solid #e6e0d4;border-radius:12px;background:#fffcf7">
        <p id="anketa-mail-setup-hint" style="margin:0 0 8px;font-size:13px;line-height:1.4"></p>
        <div class="form-group">
          <label for="anketa-mail-user">Ugradýan Gmail</label>
          <input type="email" id="anketa-mail-user" placeholder="siz@gmail.com" style="width:100%">
        </div>
        <div id="anketa-mail-pass-wrap" class="form-group" style="margin-bottom:0">
          <label for="anketa-mail-pass">App Password</label>
          <input type="password" id="anketa-mail-pass" placeholder="16 harp" style="width:100%">
        </div>
      </div>
      <div class="form-group" style="margin-bottom:10px;padding:12px;border:1px solid #e6e0d4;border-radius:12px;background:#faf8f4">
        <label for="anketa-mail-company" style="font-weight:600">Firma</label>
        <select id="anketa-mail-company" style="width:100%;margin-bottom:8px;padding:8px 10px;border-radius:8px;border:1px solid #d8d2c6">
          <option value="">Ýüklenýär...</option>
        </select>
        <label for="anketa-mail-vacancy" style="font-weight:600">Wakansiýa</label>
        <select id="anketa-mail-vacancy" style="width:100%;padding:8px 10px;border-radius:8px;border:1px solid #d8d2c6">
          <option value="">Ýüklenýär...</option>
        </select>
        <p id="anketa-mail-jogapkar-hint" class="muted" style="margin:8px 0 0;font-size:12px;line-height:1.45" hidden></p>
        <p class="muted" style="margin:6px 0 0;font-size:11px">Wakansiýa saýlanynda jogapkär e-poçtasy awtomatik doldurylar we hödürlenýär.</p>
      </div>
      <div class="form-group">
        <label for="anketa-mail-email-pick">Jogapkär e-poçtasy</label>
        <select id="anketa-mail-email-pick" class="hidden" style="width:100%;margin-bottom:6px;padding:8px 10px;border-radius:8px;border:1px solid #d8d2c6"></select>
        <label for="anketa-mail-to">Alyjy e-poçta</label>
        <input type="email" id="anketa-mail-to" value="${escHtml(emailPrefill)}" placeholder="mysal@firma.com" style="width:100%"
          onkeydown="if(event.key==='Enter'){event.preventDefault();AnketaMail.confirmSend(${anketa.id});}">
      </div>
      <div class="form-group">
        <label for="anketa-mail-note">Bellik (islege bagly)</label>
        <textarea id="anketa-mail-note" rows="2" style="width:100%" placeholder="Goşmaça hat..."></textarea>
      </div>
      <div style="display:flex;gap:8px;justify-content:flex-end;margin-top:14px">
        <button type="button" class="btn btn-ghost" onclick="AnketaMail.closeModal()">Ýap</button>
        <button type="button" class="btn btn-accent" id="btn-anketa-mail-send"
          onclick="AnketaMail.confirmSend(${anketa.id})">Ugrat</button>
      </div>
    `);

    initVacancyPicker({ vacancyId: vacId || null, defaultEmail: emailPrefill });
    refreshMailStatus();
  }

  global.AnketaMail = {
    openAnketaEmailModal,
    confirmSend,
    closeModal,
    refreshMailStatus,
  };
})(window);
