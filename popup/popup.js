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
    tbody.innerHTML = comments.map(c => {
      const bl = blMap[c.backlink_id];
      const url = bl?.url || 'unknown';
      let shortUrl = url;
      try { shortUrl = new URL(url).hostname; } catch(e) {}
      return `
        <tr>
          <td title="${url}">${shortUrl}</td>
          <td title="${c.comment_text}">${(c.comment_text || '').substring(0, 60)}...</td>
          <td><span class="status-${c.status}">${c.status}</span></td>
          <td>${c.posted_at ? new Date(c.posted_at).toLocaleDateString() : '-'}</td>
        </tr>
      `;
    }).join('') || '<tr><td colspan="4" style="color:#666">No comments yet</td></tr>';
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
    $('#set-website').value = s.promotedWebsite || '';
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
    promotedWebsite: $('#set-website').value.trim(),
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

// Init
refreshStats();
refreshLogs();
loadSettings();
setInterval(() => { refreshStats(); refreshLogs(); }, 3000);
