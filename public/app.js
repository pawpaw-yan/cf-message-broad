(() => {
  'use strict';

  const REFRESH_INTERVAL = 30 * 1000;

  const listEl = document.getElementById('message-list');
  const statusEl = document.getElementById('status');
  const refreshBtn = document.getElementById('refresh-btn');
  const lastUpdatedEl = document.getElementById('last-updated');
  const copyBtn = document.getElementById('copy-btn');

  let lastSeenId = null;

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

  // ---------- 渲染 ----------

  function renderMessages(messages, { animateFirst = false } = {}) {
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

  // ---------- 事件 ----------

  refreshBtn.addEventListener('click', () => loadMessages({ animateFirst: false }));

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

  loadMessages();
})();
