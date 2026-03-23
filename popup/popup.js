// Popup controller
const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => document.querySelectorAll(sel);

// Tab switching
$$('.tab').forEach(tab => {
  tab.addEventListener('click', () => {
    $$('.tab').forEach(t => t.classList.remove('active'));
    $$('.tab-content').forEach(t => t.classList.remove('active'));
    tab.classList.add('active');
    $(`#tab-${tab.dataset.tab}`).classList.add('active');
    if (tab.dataset.tab === 'domains') loadDomains();
    if (tab.dataset.tab === 'backlinks') loadBacklinks();
    if (tab.dataset.tab === 'comments') loadComments();
    if (tab.dataset.tab === 'discovered') loadDiscovered();
  });
});

// Stats refresh
async function refreshStats() {
  chrome.runtime.sendMessage({ action: 'getStats' }, (stats) => {
    if (!stats) return;
    $('#stat-domains').textContent = stats.domains?.total || 0;
    $('#stat-commentable').textContent = stats.backlinks?.commentable || 0;
    $('#stat-posted').textContent = stats.comments?.posted || 0;
    $('#stat-discovered').textContent = stats.discovered?.total || 0;
  });
}

// Logs
function refreshLogs() {
  chrome.runtime.sendMessage({ action: 'getLogs' }, (logs) => {
    if (!logs) return;
    const container = $('#log-container');
    container.innerHTML = logs.slice(-20).reverse().map(l => {
      const time = new Date(l.time).toLocaleTimeString();
      return `<div class="log-entry"><span class="time">${time}</span> ${l.message}</div>`;
    }).join('');
  });
}

// Load domains table
function loadDomains() {
  chrome.runtime.sendMessage({ action: 'getStats' }, () => {});
  // Use background to get data via indexedDB isn't directly accessible from popup in MV3
  // We'll use a message-based approach
  chrome.runtime.sendMessage({ action: 'exportData' }, (data) => {
    if (!data) return;
    const tbody = $('#domains-table tbody');
    tbody.innerHTML = (data.domains || []).map(d => `
      <tr>
        <td title="${d.domain}">${d.domain}</td>
        <td>${d.depth}</td>
        <td><span class="status-${d.status}">${d.status}</span></td>
        <td>${new Date(d.created_at).toLocaleDateString()}</td>
      </tr>
    `).join('') || '<tr><td colspan="4" style="color:#666">No domains yet</td></tr>';
  });
}

// Load backlinks table
function loadBacklinks() {
  const filter = $('#bl-filter').value;
  chrome.runtime.sendMessage({ action: 'exportData' }, (data) => {
    if (!data) return;
    let bls = data.backlinks || [];
    if (filter !== 'all') bls = bls.filter(b => b.comment_status === filter);
    $('#bl-count').textContent = `${bls.length} results`;
    const tbody = $('#backlinks-table tbody');
    tbody.innerHTML = bls.slice(0, 200).map(b => {
      let shortUrl = b.url;
      try { shortUrl = new URL(b.url).hostname + new URL(b.url).pathname.substring(0, 30); } catch(e) {}
      return `
        <tr>
          <td title="${b.url}"><a href="${b.url}" target="_blank" style="color:#4fc3f7">${shortUrl}</a></td>
          <td title="${b.anchor_text}">${b.anchor_text || '-'}</td>
          <td>${b.link_type || '-'}</td>
          <td><span class="status-${b.comment_status}">${b.comment_status}</span></td>
        </tr>
      `;
    }).join('') || '<tr><td colspan="4" style="color:#666">No backlinks yet</td></tr>';
  });
}

$('#bl-filter').addEventListener('change', loadBacklinks);

// Load comments table
function loadComments() {
  chrome.runtime.sendMessage({ action: 'exportData' }, (data) => {
    if (!data) return;
    const comments = data.comments || [];
    const blMap = {};
    (data.backlinks || []).forEach(b => blMap[b.id] = b);
    const tbody = $('#comments-table tbody');
    tbody.innerHTML = comments.map((c, i) => {
      const bl = blMap[c.backlink_id];
      const url = bl?.url || 'unknown';
      let shortUrl = url;
      try { shortUrl = new URL(url).hostname; } catch(e) {}
      return `
        <tr class="comment-row" data-idx="${i}" style="cursor:pointer" title="Click to expand">
          <td title="${url}">${shortUrl}</td>
          <td class="comment-cell" id="comment-cell-${i}">${(c.comment_text || '').substring(0, 60)}...</td>
          <td><span class="status-${c.status}">${c.status}</span></td>
          <td>${c.posted_at ? new Date(c.posted_at).toLocaleDateString() : '-'}</td>
        </tr>
        <tr class="comment-expand" id="comment-expand-${i}" style="display:none">
          <td colspan="4" style="white-space:pre-wrap;padding:10px;background:#0d1117;color:#ccc;font-size:12px;line-height:1.6">${(c.comment_text || '').replace(/</g, '&lt;')}\n\n<b>Website:</b> ${c.website_url || '-'}\n<b>Target:</b> <a href="${url}" target="_blank" style="color:#4fc3f7">${url}</a></td>
        </tr>
      `;
    }).join('') || '<tr><td colspan="4" style="color:#666">No comments yet</td></tr>';

    // Toggle expand on click
    tbody.querySelectorAll('.comment-row').forEach(row => {
      row.addEventListener('click', () => {
        const idx = row.dataset.idx;
        const expand = document.getElementById(`comment-expand-${idx}`);
        expand.style.display = expand.style.display === 'none' ? '' : 'none';
      });
    });
  });
}

// Load discovered sites table
function loadDiscovered() {
  chrome.runtime.sendMessage({ action: 'exportData' }, (data) => {
    if (!data) return;
    const sites = data.discovered_sites || [];
    const blMap = {};
    (data.backlinks || []).forEach(b => blMap[b.id] = b);
    const tbody = $('#discovered-table tbody');
    // Deduplicate by domain
    const seen = new Set();
    const unique = sites.filter(s => {
      if (seen.has(s.domain)) return false;
      seen.add(s.domain);
      return true;
    });
    tbody.innerHTML = unique.map(s => {
      const source = blMap[s.source_backlink_id];
      let sourceHost = '';
      try { sourceHost = new URL(source?.url || '').hostname; } catch(e) {}
      return `
        <tr>
          <td>${s.domain || ''}</td>
          <td title="${s.url}"><a href="${s.url}" target="_blank" style="color:#4fc3f7">${s.url?.substring(0, 50) || ''}</a></td>
          <td title="${source?.url || ''}">${sourceHost}</td>
          <td><input type="checkbox" class="discovered-check" data-id="${s.id}" ${s.checked ? 'checked' : ''}></td>
        </tr>
      `;
    }).join('') || '<tr><td colspan="4" style="color:#666">No discovered sites yet</td></tr>';

    // Bind checkbox events
    tbody.querySelectorAll('.discovered-check').forEach(cb => {
      cb.addEventListener('change', (e) => {
        const id = parseInt(e.target.dataset.id);
        chrome.runtime.sendMessage({ action: 'updateDiscovered', id, checked: e.target.checked });
      });
    });
  });
}

// Button handlers
$('#btn-scrape').addEventListener('click', () => {
  const domain = $('#seed-domain').value.trim();
  if (!domain) return alert('Enter a domain first');
  chrome.runtime.sendMessage({ action: 'startScraping', domain });
  $('#status-badge').textContent = 'SCRAPING';
  $('#status-badge').className = 'badge badge-scraping';
});

$('#btn-detect').addEventListener('click', () => {
  chrome.runtime.sendMessage({ action: 'startDetecting' });
  $('#status-badge').textContent = 'DETECTING';
  $('#status-badge').className = 'badge badge-detecting';
});

$('#btn-generate').addEventListener('click', () => {
  chrome.runtime.sendMessage({ action: 'generateComments' });
  $('#status-badge').textContent = 'GENERATING';
  $('#status-badge').className = 'badge badge-generating';
});

$('#btn-post').addEventListener('click', () => {
  if (!confirm('Start posting comments? Make sure AI comments have been generated.')) return;
  chrome.runtime.sendMessage({ action: 'startPosting' });
  $('#status-badge').textContent = 'POSTING';
  $('#status-badge').className = 'badge badge-posting';
});

$('#btn-pause').addEventListener('click', () => {
  chrome.runtime.sendMessage({ action: 'pause' });
  $('#status-badge').textContent = 'PAUSED';
  $('#status-badge').className = 'badge badge-paused';
});

// Settings
function loadSettings() {
  chrome.storage.local.get('settings', (data) => {
    const s = data.settings || {};
    $('#set-ahrefs').value = s.ahrefsKey || '';
    $('#set-mindr').value = s.minDR || 10;
    $('#set-endpoint').value = s.apiEndpoint || '';
    $('#set-apikey').value = s.apiKey || '';
    $('#set-model').value = s.model || 'gpt-4o-mini';
    $('#set-name').value = s.commenterName || '';
    $('#set-email').value = s.commenterEmail || '';
    $('#set-websites').value = (s.promotedWebsites || [s.promotedWebsite || '']).filter(Boolean).join('\n');
    $('#set-depth').value = s.maxDepth || 2;
    $('#set-delay').value = s.delayMs || 5000;
  });
}

$('#btn-save').addEventListener('click', () => {
  const settings = {
    ahrefsKey: $('#set-ahrefs').value.trim(),
    minDR: parseInt($('#set-mindr').value) || 10,
    apiEndpoint: $('#set-endpoint').value.trim(),
    apiKey: $('#set-apikey').value.trim(),
    model: $('#set-model').value.trim(),
    commenterName: $('#set-name').value.trim(),
    commenterEmail: $('#set-email').value.trim(),
    promotedWebsites: $('#set-websites').value.split('\n').map(s => s.trim()).filter(Boolean),
    promotedWebsite: $('#set-websites').value.split('\n').map(s => s.trim()).filter(Boolean)[0] || '',
    maxDepth: parseInt($('#set-depth').value) || 2,
    delayMs: parseInt($('#set-delay').value) || 5000
  };
  chrome.storage.local.set({ settings }, () => {
    alert('Settings saved!');
  });
});

$('#btn-export').addEventListener('click', () => {
  chrome.runtime.sendMessage({ action: 'exportData' }, (data) => {
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = 'backlink-data.json'; a.click();
    URL.revokeObjectURL(url);
  });
});

$('#btn-clear').addEventListener('click', () => {
  if (!confirm('Delete ALL data? This cannot be undone.')) return;
  chrome.runtime.sendMessage({ action: 'clearAll' }, () => {
    refreshStats();
    refreshLogs();
    alert('All data cleared.');
  });
});

// Listen for updates from background
chrome.runtime.onMessage.addListener((msg) => {
  if (msg.action === 'dataUpdated') {
    refreshStats();
    refreshLogs();
  }
});

// Chat functionality
let chatHistory = [];

function addChatMessage(role, text) {
  const container = $('#chat-messages');
  const div = document.createElement('div');
  div.className = `chat-msg ${role}`;
  div.textContent = text;
  container.appendChild(div);
  container.scrollTop = container.scrollHeight;
}

async function sendChat() {
  const input = $('#chat-input');
  const text = input.value.trim();
  if (!text) return;

  input.value = '';
  addChatMessage('user', text);

  // Gather current data context
  chrome.runtime.sendMessage({ action: 'exportData' }, async (data) => {
    if (!data) { addChatMessage('system', 'Error: could not load data'); return; }

    const stats = {
      domains: (data.domains || []).length,
      backlinks: (data.backlinks || []).length,
      commentable: (data.backlinks || []).filter(b => b.comment_status === 'commentable').length,
      needs_login: (data.backlinks || []).filter(b => b.comment_status === 'needs_login').length,
      has_captcha: (data.backlinks || []).filter(b => b.comment_status === 'has_captcha').length,
      no_comment: (data.backlinks || []).filter(b => b.comment_status === 'no_comment').length,
      unchecked: (data.backlinks || []).filter(b => b.comment_status === 'unchecked').length,
      comments_posted: (data.comments || []).filter(c => c.status === 'posted').length,
      comments_pending: (data.comments || []).filter(c => c.status === 'pending').length,
      discovered: (data.discovered_sites || []).length
    };

    // Build top backlinks summary (top 20 by authority)
    const topBacklinks = (data.backlinks || [])
      .sort((a, b) => (b.authority_score || 0) - (a.authority_score || 0))
      .slice(0, 20)
      .map(b => `${b.url} | DR:${b.authority_score || '?'} | ${b.comment_status} | anchor:"${b.anchor_text || ''}"`)
      .join('\n');

    const systemPrompt = `You are an SEO backlink analysis assistant embedded in a Chrome extension. You have access to the user's backlink data.

Current stats:
- Domains scanned: ${stats.domains}
- Total backlinks: ${stats.backlinks}
- Commentable: ${stats.commentable}
- Needs login: ${stats.needs_login}
- Has captcha: ${stats.has_captcha}
- No comment: ${stats.no_comment}
- Unchecked: ${stats.unchecked}
- Comments posted: ${stats.comments_posted}
- Comments pending: ${stats.comments_pending}
- Discovered sites: ${stats.discovered}

Top backlinks (by Domain Rating):
${topBacklinks || 'No backlinks yet'}

Answer concisely. If asked to write comments, make them natural and relevant.`;

    chatHistory.push({ role: 'user', content: text });

    // Load settings for API config
    chrome.storage.local.get('settings', async (sdata) => {
      const s = sdata.settings || {};
      if (!s.apiKey || !s.apiEndpoint) {
        addChatMessage('system', 'Please configure LLM API in Settings first.');
        return;
      }

      try {
        const endpoint = s.apiEndpoint.replace(/\/$/, '');
        const url = endpoint.includes('/chat/completions') ? endpoint : `${endpoint}/chat/completions`;

        const resp = await fetch(url, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${s.apiKey}`
          },
          body: JSON.stringify({
            model: s.model || 'deepseek-chat',
            messages: [
              { role: 'system', content: systemPrompt },
              ...chatHistory.slice(-10)
            ],
            temperature: 0.7,
            max_tokens: 500
          })
        });

        if (!resp.ok) {
          addChatMessage('system', `API error: ${resp.status}`);
          return;
        }

        const result = await resp.json();
        const reply = result.choices?.[0]?.message?.content?.trim();
        if (reply) {
          chatHistory.push({ role: 'assistant', content: reply });
          addChatMessage('assistant', reply);
        } else {
          addChatMessage('system', 'No response from AI');
        }
      } catch (err) {
        addChatMessage('system', `Error: ${err.message}`);
      }
    });
  });
}

$('#btn-chat-send').addEventListener('click', sendChat);
$('#chat-input').addEventListener('keydown', (e) => {
  if (e.key === 'Enter') sendChat();
});

// Init
refreshStats();
refreshLogs();
loadSettings();
setInterval(() => { refreshStats(); refreshLogs(); }, 3000);
