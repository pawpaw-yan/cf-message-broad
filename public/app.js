(() => {
  'use strict';

  const REFRESH_INTERVAL = 30 * 1000;

  const listEl = document.getElementById('message-list');
  const statusEl = document.getElementById('status');
  const refreshBtn = document.getElementById('refresh-btn');
  const adminBtn = document.getElementById('admin-btn');
  const lastUpdatedEl = document.getElementById('last-updated');
  const copyBtn = document.getElementById('copy-btn');

  // 管理面板
  const adminPanel = document.getElementById('admin-panel');
  const logoutBtn = document.getElementById('logout-btn');
  const clearBtn = document.getElementById('clear-btn');
  const secretsListEl = document.getElementById('secrets-list');
  const secretForm = document.getElementById('secret-form');
  const secretNameInput = document.getElementById('secret-name');
  const secretValueInput = document.getElementById('secret-value');

  // 登录弹窗
  const modal = document.getElementById('modal');
  const modalError = document.getElementById('modal-error');
  const passwordInput = document.getElementById('admin-password-input');
  const modalLoginBtn = document.getElementById('modal-login');
  const modalCancelBtn = document.getElementById('modal-cancel');

  let lastSeenId = null;
  let currentMessages = [];

  // ---------- 管理员状态 ----------

  let adminPassword = sessionStorage.getItem('adminPassword') || '';
  let managedSecrets = [];
  const isAdmin = () => !!adminPassword;

  // ---------- 工具 ----------

  function escapeHtml(str) {
    return str
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  // 纯文本安全渲染：转义后仅把 http(s) 链接转为 <a>
  function renderText(raw) {
    const escaped = escapeHtml(raw);
    return escaped.replace(/https?:\/\/[^\s<>"')\]]+/g, (url) => {
      const safe = escapeHtml(url);
      return `<a href="${safe}" target="_blank" rel="noopener noreferrer nofollow">${safe}</a>`;
    });
  }

  function relativeTime(ts) {
    const diff = Date.now() - ts;
    const minute = 60 * 1000;
    if (diff < minute) return '刚刚';
    if (diff < 60 * minute) return `${Math.floor(diff / minute)} 分钟前`;
    if (diff < 24 * 60 * minute) return `${Math.floor(diff / (60 * minute))} 小时前`;
    if (diff < 7 * 24 * 60 * minute) return `${Math.floor(diff / (24 * 60 * minute))} 天前`;
    return new Date(ts).toLocaleDateString('zh-CN', { month: 'numeric', day: 'numeric' });
  }

  const AVATAR_COLORS = ['#4f6ef7', '#00a372', '#e8590c', '#be4bdb', '#f08c00', '#1098ad', '#e64980'];

  function avatarColor(name) {
    let hash = 0;
    for (let i = 0; i < name.length; i++) hash = (hash * 31 + name.charCodeAt(i)) >>> 0;
    return AVATAR_COLORS[hash % AVATAR_COLORS.length];
  }

  function showStatus(text) {
    statusEl.textContent = text;
    statusEl.classList.remove('hidden');
  }

  function hideStatus() {
    statusEl.classList.add('hidden');
  }

  // ---------- 留言渲染 ----------

  function renderMessages(messages, { animateFirst = false } = {}) {
    currentMessages = messages;
    listEl.innerHTML = '';

    if (!messages.length) {
      listEl.innerHTML = `
        <div class="empty">
          <span class="empty-icon">📭</span>
          <div>还没有留言</div>
          <div class="empty-hint">通过 Webhook 发送第一条消息吧（见下方使用说明）</div>
        </div>`;
      return;
    }

    messages.forEach((msg, index) => {
      const isNew = animateFirst && index === 0 && lastSeenId && msg.id !== lastSeenId;
      const item = document.createElement('article');
      item.className = 'message' + (isNew ? ' is-new' : '');
      item.dataset.id = msg.id;

      const avatar = document.createElement('div');
      avatar.className = 'avatar';
      avatar.style.background = avatarColor(msg.name || '?');
      avatar.textContent = (msg.name || '?').trim().charAt(0).toUpperCase() || '?';

      const body = document.createElement('div');
      body.className = 'message-body';

      const meta = document.createElement('div');
      meta.className = 'message-meta';

      const author = document.createElement('span');
      author.className = 'message-author';
      author.textContent = msg.name || '匿名';

      const time = document.createElement('time');
      time.className = 'message-time';
      time.title = new Date(msg.timestamp).toLocaleString('zh-CN');
      time.textContent = relativeTime(msg.timestamp);

      meta.appendChild(author);
      meta.appendChild(time);
      if (msg.source) {
        const source = document.createElement('span');
        source.className = 'message-source';
        source.textContent = msg.source;
        meta.appendChild(source);
      }

      const text = document.createElement('div');
      text.className = 'message-text';
      text.innerHTML = renderText(msg.message || '');

      body.appendChild(meta);
      body.appendChild(text);
      item.appendChild(avatar);
      item.appendChild(body);

      if (isAdmin()) {
        const del = document.createElement('button');
        del.className = 'btn-delete';
        del.title = '删除这条留言';
        del.setAttribute('aria-label', '删除留言');
        del.textContent = '×';
        item.appendChild(del);
      }

      listEl.appendChild(item);
    });
  }

  // ---------- 数据加载 ----------

  async function loadMessages({ animateFirst = false } = {}) {
    refreshBtn.classList.add('spinning');
    try {
      const res = await fetch('/api/messages?limit=100', { headers: { Accept: 'application/json' } });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || `加载失败（HTTP ${res.status}）`);
      }
      const data = await res.json();
      renderMessages(data.messages || [], { animateFirst });
      if (data.messages && data.messages.length) lastSeenId = data.messages[0].id;
      hideStatus();
      lastUpdatedEl.textContent = `更新于 ${new Date().toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })}`;
    } catch (err) {
      showStatus(`⚠️ ${err.message}`);
    } finally {
      refreshBtn.classList.remove('spinning');
    }
  }

  // ---------- curl 示例（跟随当前域名） ----------

  function updateCurlExample() {
    const first = managedSecrets[0];
    const secretPart = first ? `?secret=${encodeURIComponent(first.secret)}` : '';
    document.getElementById('curl-example').textContent =
      `curl -X POST ${location.origin}/api/messages${secretPart} \\\n` +
      `  -H "Content-Type: application/json" \\\n` +
      `  -d '{"name": "小明", "message": "你好，世界！"}'`;

    const hint = document.getElementById('secret-hint');
    if (first) {
      hint.innerHTML = '管理员登录后，示例已自动带上第一把密钥；也可以在请求头 <code>X-Webhook-Secret</code> 中携带。';
    }
  }

  // ---------- 管理面板 ----------

  function updateAdminUi() {
    adminPanel.classList.toggle('hidden', !isAdmin());
    adminBtn.classList.toggle('active', isAdmin());
    adminBtn.title = isAdmin() ? '退出管理' : '管理员登录';
    updateCurlExample();
    // 重渲染列表以显隐删除按钮
    if (currentMessages.length) renderMessages(currentMessages);
  }

  async function loadSecrets() {
    if (!isAdmin()) { managedSecrets = []; return; }
    try {
      const res = await fetch('/api/admin/secrets', {
        headers: { 'X-Admin-Secret': adminPassword },
      });
      if (res.status === 401 || res.status === 403) {
        // 密码已失效（被修改），退出登录
        doLogout();
        showStatus('⚠️ 管理员凭证已失效，请重新登录');
        return;
      }
      const data = await res.json();
      managedSecrets = data.secrets || [];
      renderSecrets();
      updateCurlExample();
    } catch {
      /* 密钥列表加载失败不打断页面 */
    }
  }

  function renderSecrets() {
    secretsListEl.innerHTML = '';
    if (!managedSecrets.length) {
      const p = document.createElement('p');
      p.className = 'hint';
      p.style.margin = '0 0 8px';
      p.textContent = '还没有密钥。添加一把密钥后，发送留言就必须携带有效密钥。';
      secretsListEl.appendChild(p);
      return;
    }

    managedSecrets.forEach((s) => {
      const row = document.createElement('div');
      row.className = 'secret-row';

      const name = document.createElement('span');
      name.className = 'secret-name';
      name.textContent = s.name || '未命名密钥';
      name.title = s.name || '未命名密钥（署名将显示密钥值）';

      const value = document.createElement('code');
      value.className = 'secret-value';
      value.textContent = s.secret;
      value.title = s.secret;

      const copyBtn = document.createElement('button');
      copyBtn.className = 'btn-mini';
      copyBtn.textContent = '复制';
      copyBtn.addEventListener('click', async () => {
        try {
          await navigator.clipboard.writeText(s.secret);
          copyBtn.textContent = '已复制';
        } catch {
          copyBtn.textContent = '复制失败';
        }
        setTimeout(() => (copyBtn.textContent = '复制'), 1500);
      });

      const delBtn = document.createElement('button');
      delBtn.className = 'btn-mini delete';
      delBtn.textContent = '删除';
      delBtn.addEventListener('click', async () => {
        if (!confirm(`确定删除密钥「${s.name || '未命名密钥'}」吗？使用它的调用方将立即失效。`)) return;
        const res = await fetch(`/api/admin/secrets/${encodeURIComponent(s.id)}`, {
          method: 'DELETE',
          headers: { 'X-Admin-Secret': adminPassword },
        });
        if (!res.ok) {
          const err = await res.json().catch(() => ({}));
          alert(err.error || '删除失败');
          return;
        }
        loadSecrets();
      });

      row.append(name, value, copyBtn, delBtn);
      secretsListEl.appendChild(row);
    });
  }

  // ---------- 登录 / 退出 ----------

  function openModal() {
    modal.classList.remove('hidden');
    modalError.classList.add('hidden');
    passwordInput.value = '';
    passwordInput.focus();
  }

  function closeModal() {
    modal.classList.add('hidden');
  }

  async function login() {
    const password = passwordInput.value;
    if (!password) return;
    modalLoginBtn.disabled = true;
    try {
      const res = await fetch('/api/admin/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || `登录失败（HTTP ${res.status}）`);
      }
      adminPassword = password;
      sessionStorage.setItem('adminPassword', password);
      closeModal();
      updateAdminUi();
      await loadSecrets();
      loadMessages();
    } catch (err) {
      modalError.textContent = err.message;
      modalError.classList.remove('hidden');
    } finally {
      modalLoginBtn.disabled = false;
    }
  }

  function doLogout() {
    adminPassword = '';
    managedSecrets = [];
    sessionStorage.removeItem('adminPassword');
    updateAdminUi();
  }

  // ---------- 事件 ----------

  refreshBtn.addEventListener('click', () => loadMessages({ animateFirst: false }));

  adminBtn.addEventListener('click', () => {
    if (isAdmin()) {
      doLogout();
      loadMessages();
    } else {
      openModal();
    }
  });

  logoutBtn.addEventListener('click', () => {
    doLogout();
    loadMessages();
  });

  modalLoginBtn.addEventListener('click', login);
  passwordInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') login();
  });
  modalCancelBtn.addEventListener('click', closeModal);
  modal.addEventListener('click', (e) => {
    if (e.target === modal) closeModal();
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') closeModal();
  });

  // 删除单条留言（事件委托）
  listEl.addEventListener('click', async (e) => {
    const btn = e.target.closest('.btn-delete');
    if (!btn) return;
    const card = btn.closest('.message');
    const id = card?.dataset.id;
    if (!id) return;
    if (!confirm('确定删除这条留言吗？')) return;
    const res = await fetch(`/api/messages/${encodeURIComponent(id)}`, {
      method: 'DELETE',
      headers: { 'X-Admin-Secret': adminPassword },
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      showStatus(`⚠️ 删除失败：${err.error || res.status}`);
      return;
    }
    card.remove();
    currentMessages = currentMessages.filter((m) => m.id !== id);
    if (!currentMessages.length) loadMessages();
  });

  // 清空全部
  clearBtn.addEventListener('click', async () => {
    if (!confirm('确定要清空【全部】留言吗？此操作不可恢复。')) return;
    const res = await fetch('/api/messages', {
      method: 'DELETE',
      headers: { 'X-Admin-Secret': adminPassword },
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      showStatus(`⚠️ 清空失败：${err.error || res.status}`);
      return;
    }
    loadMessages();
  });

  // 添加密钥
  secretForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const body = { name: secretNameInput.value.trim(), secret: secretValueInput.value.trim() };
    if (!body.name && !body.secret) {
      // 全空 = 快速生成一把
      body.name = '快速密钥';
    }
    const res = await fetch('/api/admin/secrets', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Admin-Secret': adminPassword },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      alert(err.error || '添加失败');
      return;
    }
    secretNameInput.value = '';
    secretValueInput.value = '';
    loadSecrets();
  });

  copyBtn.addEventListener('click', async () => {
    const text = document.getElementById('curl-example').textContent;
    try {
      await navigator.clipboard.writeText(text);
      copyBtn.textContent = '✓ 已复制';
    } catch {
      copyBtn.textContent = '复制失败，请手动选择';
    }
    setTimeout(() => (copyBtn.textContent = '复制 curl 示例'), 2000);
  });

  // 页面可见时每 30 秒自动刷新，切到后台暂停
  setInterval(() => {
    if (document.visibilityState === 'visible') loadMessages({ animateFirst: true });
  }, REFRESH_INTERVAL);

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') loadMessages({ animateFirst: false });
  });

  // ---------- 初始化 ----------

  updateCurlExample();
  updateAdminUi();
  loadMessages();
  loadSecrets();
})();
