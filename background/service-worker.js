// Background Service Worker — message routing and tab management
importScripts('../lib/db.js', '../lib/ai.js', '../lib/pipeline.js', '../lib/ahrefs.js');

let currentDomainId = null;
let detectQueue = [];
let isDetecting = false;
let settings = {};

// Load settings on startup
chrome.storage.local.get('settings', (data) => {
  settings = data.settings || {};
});

// Listen for settings changes
chrome.storage.onChanged.addListener((changes) => {
  if (changes.settings) settings = changes.settings.newValue || {};
});

// Main message handler
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  switch (msg.action) {

    case 'backlinkData': {
      // Received scraped backlinks from Semrush content script
      handleBacklinkData(msg.data, msg.page);
      sendResponse({ ok: true });
      break;
    }

    case 'scrapingComplete': {
      log(`Scraping complete: ${msg.total} backlinks from ${msg.pages} pages`);
      if (currentDomainId) {
        DB.updateDomain(currentDomainId, { status: 'scraped' });
      }
      broadcastUpdate();
      sendResponse({ ok: true });
      break;
    }

    case 'interceptedData': {
      // Intercepted API data from Semrush — try to parse
      log('Received intercepted API data');
      sendResponse({ ok: true });
      break;
    }

    case 'detectResult': {
      // Result from comment detector content script
      handleDetectResult(msg.data, sender.tab);
      sendResponse({ ok: true });
      break;
    }

    case 'postResult': {
      handlePostResult(msg.data, sender.tab);
      sendResponse({ ok: true });
      break;
    }

    case 'startScraping': {
      startScraping(msg.domain);
      sendResponse({ ok: true });
      break;
    }

    case 'startDetecting': {
      startDetecting();
      sendResponse({ ok: true });
      break;
    }

    case 'startPosting': {
      startPosting();
      sendResponse({ ok: true });
      break;
    }

    case 'generateComments': {
      generateComments();
      sendResponse({ ok: true });
      break;
    }

    case 'pause': {
      Pipeline.pause();
      isDetecting = false;
      log('Pipeline paused');
      sendResponse({ ok: true });
      break;
    }

    case 'resume': {
      Pipeline.resume();
      sendResponse({ ok: true });
      break;
    }

    case 'getStats': {
      DB.getStats().then(stats => sendResponse(stats));
      return true; // async response
    }

    case 'getLogs': {
      chrome.storage.local.get('logs', (data) => {
        sendResponse(data.logs || []);
      });
      return true;
    }

    case 'updateDiscovered': {
      DB.updateDiscoveredSite(msg.id, { checked: msg.checked }).then(() => sendResponse({ ok: true }));
      return true;
    }

    case 'clearAll': {
      DB.clearAll().then(() => {
        chrome.storage.local.remove('logs');
        sendResponse({ ok: true });
      });
      return true;
    }

    case 'exportData': {
      exportAllData().then(data => sendResponse(data));
      return true;
    }

    case 'log': {
      log(msg.message);
      sendResponse({ ok: true });
      break;
    }

    default:
      sendResponse({ ok: false, error: 'Unknown action' });
  }
  return true;
});

// Store scraped backlink data
async function handleBacklinkData(rows, page) {
  await DB.init();
  let added = 0;
  for (const row of rows) {
    // Filter: authority >= 10
    if (row.authority_score < 10 && row.authority_score > 0) continue;

    try {
      const domain = new URL(row.url).hostname;
      await DB.addBacklink({
        domain_id: currentDomainId,
        url: row.url,
        page_title: '',
        anchor_text: row.anchor_text,
        link_type: row.link_type,
        comment_status: 'unchecked',
        has_url_field: false,
        form_selector: null,
        url_field_selector: null
      });
      added++;
    } catch (e) { /* invalid URL, skip */ }
  }
  log(`Page ${page}: saved ${added} backlinks (filtered ${rows.length - added})`);
  broadcastUpdate();
}

// Start scraping a domain via Ahrefs API
async function startScraping(domain) {
  await DB.init();

  // Clean domain input
  domain = domain.replace(/^https?:\/\//, '').replace(/\/+$/, '');

  const id = await DB.addDomain({
    domain: domain,
    source_domain: null,
    depth: 0,
    authority_score: 0,
    organic_traffic: 0,
    status: 'pending'
  });
  currentDomainId = id;
  Pipeline.setState('SCRAPING');
  log(`Fetching backlinks for ${domain} via Ahrefs API...`);

  if (!settings.ahrefsKey) {
    log('ERROR: Ahrefs API key not configured. Go to Settings.');
    return;
  }

  const minDR = parseInt(settings.minDR) || 10;
  const result = await Ahrefs.getAllBacklinks(domain, settings.ahrefsKey, { minDR });

  if (result.error) {
    log(`API error: ${result.error}`);
  }

  // Save backlinks to DB
  let added = 0;
  for (const bl of result.backlinks) {
    try {
      await DB.addBacklink({
        domain_id: id,
        url: bl.url,
        page_title: bl.title,
        anchor_text: bl.anchor_text,
        link_type: bl.link_type,
        comment_status: 'unchecked',
        has_url_field: false,
        form_selector: null,
        url_field_selector: null,
        page_content: '',
        authority_score: bl.authority_score,
        traffic: bl.traffic
      });
      added++;
    } catch (e) { /* skip duplicates */ }
  }

  await DB.updateDomain(id, { status: 'scraped' });
  log(`Done! Fetched ${added} backlinks (DR >= ${minDR}) for ${domain}`);
  Pipeline.setState('IDLE');
  broadcastUpdate();
}

// Detection queue processor
async function startDetecting() {
  if (isDetecting) return;
  isDetecting = true;
  Pipeline.setState('DETECTING');

  await DB.init();
  const unchecked = await DB.getBacklinks({ indexName: 'comment_status', value: 'unchecked' });
  log(`Starting detection: ${unchecked.length} URLs to check`);

  for (const bl of unchecked) {
    if (Pipeline.isPaused() || !isDetecting) break;

    try {
      log(`Checking: ${bl.url}`);
      // Open tab, inject detector, wait for result
      const tab = await chrome.tabs.create({ url: bl.url, active: false });

      // Wait for page load
      await new Promise(resolve => {
        const listener = (tabId, info) => {
          if (tabId === tab.id && info.status === 'complete') {
            chrome.tabs.onUpdated.removeListener(listener);
            resolve();
          }
        };
        chrome.tabs.onUpdated.addListener(listener);
        // Timeout after 15s
        setTimeout(() => { chrome.tabs.onUpdated.removeListener(listener); resolve(); }, 15000);
      });

      // Store tab→backlink mapping for result handler
      await chrome.storage.local.set({ [`detect_${tab.id}`]: bl.id });

      // Inject detector script
      await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        files: ['content/comment-detector.js']
      });

      // Wait for result (handled by detectResult message) + delay
      await new Promise(r => setTimeout(r, 3000));

      // Close tab
      try { await chrome.tabs.remove(tab.id); } catch (e) { /* already closed */ }

      // Random delay between checks
      const delay = 3000 + Math.random() * 5000;
      await new Promise(r => setTimeout(r, delay));

    } catch (err) {
      log(`Error checking ${bl.url}: ${err.message}`);
      await DB.updateBacklink(bl.id, { comment_status: 'no_comment', checked_at: Date.now() });
    }
  }

  isDetecting = false;
  log('Detection complete');
  broadcastUpdate();
}

// Handle detection result
async function handleDetectResult(data, tab) {
  if (!tab) return;
  const storageKey = `detect_${tab.id}`;
  const stored = await chrome.storage.local.get(storageKey);
  const blId = stored[storageKey];
  if (!blId) return;

  await DB.updateBacklink(blId, {
    comment_status: data.comment_status,
    has_url_field: data.has_url_field,
    form_selector: data.form_selector,
    url_field_selector: data.url_field_selector,
    page_title: data.page_title,
    page_content: data.page_content,
    checked_at: Date.now()
  });

  // Store discovered URLs (deduplicated by domain)
  if (data.discovered_urls?.length > 0) {
    const existing = await DB.getDiscoveredSites();
    const existingDomains = new Set(existing.map(s => s.domain));
    // Also skip domains we already have as backlinks
    const existingBacklinks = await DB.getBacklinks();
    const blDomains = new Set();
    existingBacklinks.forEach(b => { try { blDomains.add(new URL(b.url).hostname); } catch(e) {} });

    let added = 0;
    for (const url of data.discovered_urls) {
      try {
        const domain = new URL(url).hostname;
        if (!existingDomains.has(domain) && !blDomains.has(domain)) {
          await DB.addDiscoveredSite({ source_backlink_id: blId, url, domain });
          existingDomains.add(domain);
          added++;
        }
      } catch (e) { /* invalid */ }
    }
    if (added > 0) log(`Discovered ${added} new unique sites from comments`);
  }

  log(`${data.comment_status}: ${tab.url || 'unknown'}`);
  chrome.storage.local.remove(storageKey);
  broadcastUpdate();
}

// Generate AI comments for commentable backlinks
async function generateComments() {
  await DB.init();
  Pipeline.setState('GENERATING');

  const commentable = await DB.getBacklinks({ indexName: 'comment_status', value: 'commentable' });
  const existing = await DB.getComments();
  const commentedIds = new Set(existing.map(c => c.backlink_id));
  const needsComment = commentable.filter(b => !commentedIds.has(b.id));

  log(`Generating comments for ${needsComment.length} pages`);

  for (const bl of needsComment) {
    if (Pipeline.isPaused()) break;

    // Randomly pick a website from the list
    const websites = settings.promotedWebsites || [settings.promotedWebsite || ''];
    const website = websites[Math.floor(Math.random() * websites.length)] || '';

    const text = await AI.generateComment(
      bl.page_title || 'Blog Post',
      bl.page_content || '',
      website,
      settings.apiKey || '',
      settings.apiEndpoint || '',
      settings.model || ''
    );

    if (text) {
      await DB.addComment({
        backlink_id: bl.id,
        comment_text: text,
        name_used: settings.commenterName || '',
        email_used: settings.commenterEmail || '',
        website_url: website
      });
      log(`Generated comment for: ${bl.url}`);
    } else {
      log(`Failed to generate comment for: ${bl.url}`);
    }

    await new Promise(r => setTimeout(r, 1000));
  }

  log('Comment generation complete');
  broadcastUpdate();
}

// Post comments
async function startPosting() {
  await DB.init();
  Pipeline.setState('POSTING');

  const pending = await DB.getComments({ indexName: 'status', value: 'pending' });
  log(`Posting ${pending.length} comments`);

  for (const comment of pending) {
    if (Pipeline.isPaused()) break;

    const bl = await DB.getBacklinks({ fn: b => b.id === comment.backlink_id });
    if (!bl.length) continue;

    try {
      const tab = await chrome.tabs.create({ url: bl[0].url, active: false });

      // Wait for load
      await new Promise(resolve => {
        const listener = (tabId, info) => {
          if (tabId === tab.id && info.status === 'complete') {
            chrome.tabs.onUpdated.removeListener(listener);
            resolve();
          }
        };
        chrome.tabs.onUpdated.addListener(listener);
        setTimeout(() => { chrome.tabs.onUpdated.removeListener(listener); resolve(); }, 15000);
      });

      await chrome.storage.local.set({ [`post_${tab.id}`]: comment.id });

      // Inject poster
      await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        files: ['content/comment-poster.js']
      });

      // Send post data
      await new Promise(r => setTimeout(r, 1000));
      chrome.tabs.sendMessage(tab.id, {
        action: 'postComment',
        data: {
          name: comment.name_used,
          email: comment.email_used,
          website: comment.website_url,
          comment: comment.comment_text,
          formSelector: bl[0].form_selector,
          urlFieldSelector: bl[0].url_field_selector
        }
      });

      // Wait for result
      await new Promise(r => setTimeout(r, 5000));
      try { await chrome.tabs.remove(tab.id); } catch (e) { }

      // Delay between posts
      const delay = 5000 + Math.random() * 10000;
      await new Promise(r => setTimeout(r, delay));

    } catch (err) {
      log(`Error posting to ${bl[0].url}: ${err.message}`);
      await DB.updateComment(comment.id, { status: 'failed', posted_at: Date.now() });
    }
  }

  log('Posting complete');
  broadcastUpdate();
}

// Handle post result
async function handlePostResult(data, tab) {
  if (!tab) return;
  const stored = await chrome.storage.local.get(`post_${tab.id}`);
  const commentId = stored[`post_${tab.id}`];
  if (!commentId) return;

  await DB.updateComment(commentId, { status: data.status, posted_at: Date.now() });
  log(`Post result: ${data.status} — ${data.message}`);
  chrome.storage.local.remove(`post_${tab.id}`);
  broadcastUpdate();
}

// Export all data
async function exportAllData() {
  await DB.init();
  return {
    domains: await DB.getDomains(),
    backlinks: await DB.getBacklinks(),
    discovered_sites: await DB.getDiscoveredSites(),
    comments: await DB.getComments(),
    exported_at: new Date().toISOString()
  };
}

// Logging
function log(message) {
  const entry = { time: new Date().toISOString(), message };
  chrome.storage.local.get('logs', (data) => {
    const logs = (data.logs || []).slice(-100); // Keep last 100 entries
    logs.push(entry);
    chrome.storage.local.set({ logs });
  });
  console.log(`[Backlink Tool] ${message}`);
}

// Notify popup of data changes
function broadcastUpdate() {
  chrome.runtime.sendMessage({ action: 'dataUpdated' }).catch(() => {});
}
