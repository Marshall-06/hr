/* Reusable komentariýa paneli — anketa / wakansiýa / hödürleme */
(function (global) {
  const esc = (v) => String(v ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

  const t = (key, fallback) => (typeof global.t === 'function' ? global.t(key) : (fallback || key));

  function authorName(c) {
    return c.author?.fullName || c.author?.username || '—';
  }

  function when(c) {
    if (typeof formatDateTime === 'function') return formatDateTime(c.createdAt);
    try {
      return new Date(c.createdAt).toLocaleString();
    } catch {
      return c.createdAt || '';
    }
  }

  function canDelete(c) {
    try {
      const u = (window.Auth && Auth.getUser()) || {};
      if (u.role === 'admin') return true;
      return u.id && Number(c.createdByUserId) === Number(u.id);
    } catch {
      return false;
    }
  }

  async function mountComments(container, entityType, entityId, opts = {}) {
    if (!container || !entityType || !entityId) return;
    const compact = !!opts.compact;
    container.dataset.entityType = entityType;
    container.dataset.entityId = String(entityId);
    container.classList.add('comments-panel');
    if (compact) container.classList.add('comments-panel--compact');

    container.innerHTML = `
      <div class="comments-head">
        <h3 class="comments-title">${esc(t('comments_title', 'Komentariýalar'))}</h3>
      </div>
      <div class="comments-list muted">${esc(t('comments_loading', 'Ýüklenýär...'))}</div>
      <div class="comments-form">
        <textarea class="comments-input" rows="${compact ? 2 : 3}"
          placeholder="${esc(t('comments_placeholder', 'Bellik ýazyň...'))}"></textarea>
        <button type="button" class="btn btn-sm btn-accent comments-submit">
          ${esc(t('comments_add', 'Goş'))}
        </button>
      </div>
    `;

    const listEl = container.querySelector('.comments-list');
    const input = container.querySelector('.comments-input');
    const btn = container.querySelector('.comments-submit');

    const render = async () => {
      try {
        const res = await api.get(`/comments?entityType=${encodeURIComponent(entityType)}&entityId=${entityId}`);
        const items = res.data?.items || [];
        if (!items.length) {
          listEl.innerHTML = `<p class="muted comments-empty">${esc(t('comments_empty', 'Heniz komentariýa ýok'))}</p>`;
          return;
        }
        listEl.innerHTML = items.map((c) => `
          <div class="comment-item" data-id="${c.id}">
            <div class="comment-meta">
              <strong>${esc(authorName(c))}</strong>
              <span class="muted">${esc(when(c))}</span>
              ${canDelete(c) ? `<button type="button" class="comment-del" data-id="${c.id}" title="${esc(t('btn_delete', 'Poz'))}">×</button>` : ''}
            </div>
            <div class="comment-body">${esc(c.body).replace(/\n/g, '<br>')}</div>
          </div>
        `).join('');

        listEl.querySelectorAll('.comment-del').forEach((el) => {
          el.addEventListener('click', async () => {
            if (!confirm(t('comments_confirm_del', 'Komentariýany pozmak?'))) return;
            try {
              await api.delete(`/comments/${el.dataset.id}`);
              await render();
            } catch (e) {
              alert(e.message || 'Pozulmady');
            }
          });
        });
        listEl.scrollTop = listEl.scrollHeight;
      } catch (e) {
        listEl.innerHTML = `<p class="muted">${esc(e.message || 'Ýalňyşlyk')}</p>`;
      }
    };

    btn.addEventListener('click', async () => {
      const body = (input.value || '').trim();
      if (!body) return;
      btn.disabled = true;
      try {
        await api.post('/comments', { entityType, entityId: Number(entityId), body });
        input.value = '';
        await render();
        if (typeof opts.onAdded === 'function') opts.onAdded();
      } catch (e) {
        alert(e.message || 'Goşulmady');
      } finally {
        btn.disabled = false;
      }
    });

    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
        e.preventDefault();
        btn.click();
      }
    });

    await render();
  }

  global.CommentsUI = { mountComments };
})(window);
