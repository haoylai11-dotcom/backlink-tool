// Semrush Backlink Scraper — Content Script
// Injected on semrush.com/analytics/backlinks/* pages
(() => {
  let isScanning = false;

  // Parse backlink rows from the Semrush table
  function parseTable() {
    const results = [];
    // Semrush uses a data table; try multiple selectors for robustness
    const rows = document.querySelectorAll('table tbody tr, [data-test="backlinks-table"] tbody tr, .___STableRow');

    rows.forEach(row => {
      const cells = row.querySelectorAll('td');
      if (cells.length < 4) return;

      // Extract data from cells — Semrush table typically has:
      // [Referring Page] [Anchor Text] [Authority Score] [Follow/Nofollow] ...
      const linkEl = cells[0]?.querySelector('a[href]');
      const url = linkEl?.href || linkEl?.textContent?.trim() || '';
      const anchor = cells[1]?.textContent?.trim() || '';

      // Authority score — look for numeric value
      let authority = 0;
      for (const cell of cells) {
        const num = parseInt(cell.textContent?.trim());
        if (num > 0 && num <= 100) { authority = num; break; }
      }

      // Follow type
      const fullText = row.textContent || '';
      const linkType = /nofollow/i.test(fullText) ? 'nofollow' : 'dofollow';

      if (url && (url.startsWith('http') || url.includes('.'))) {
        results.push({ url: url.trim(), anchor_text: anchor, authority_score: authority, link_type: linkType });
      }
    });

    return results;
  }

  // Try to intercept network responses for more reliable data
  function interceptFetch() {
    const origFetch = window.fetch;
    window.fetch = async function(...args) {
      const resp = await origFetch.apply(this, args);
      const url = typeof args[0] === 'string' ? args[0] : args[0]?.url || '';

      if (url.includes('/backlinks') || url.includes('/referring')) {
        try {
          const clone = resp.clone();
          const data = await clone.json();
          if (data?.data || data?.results || data?.rows) {
            chrome.runtime.sendMessage({
              action: 'interceptedData',
              data: data.data || data.results || data.rows
            });
          }
        } catch (e) { /* not JSON, ignore */ }
      }
      return resp;
    };
  }

  // Click next page and wait for table update
  async function goNextPage() {
    const nextBtn = document.querySelector(
      'button[aria-label="Next page"], button[data-test="next-page"], .___SPagination button:last-child, [class*="Pagination"] button:last-of-type'
    );

    if (!nextBtn || nextBtn.disabled || nextBtn.getAttribute('aria-disabled') === 'true') {
      return false;
    }

    const oldFirstRow = document.querySelector('table tbody tr td')?.textContent;
    nextBtn.click();

    // Wait for table to update (up to 10s)
    for (let i = 0; i < 20; i++) {
      await new Promise(r => setTimeout(r, 500));
      const newFirstRow = document.querySelector('table tbody tr td')?.textContent;
      if (newFirstRow && newFirstRow !== oldFirstRow) return true;
    }
    return false;
  }

  // Main scraping loop
  async function startScraping() {
    if (isScanning) return;
    isScanning = true;

    chrome.runtime.sendMessage({ action: 'log', message: 'Starting Semrush scrape...' });

    interceptFetch();
    let pageNum = 1;
    let allData = [];

    while (isScanning) {
      await new Promise(r => setTimeout(r, 1500)); // Wait for page render
      const rows = parseTable();
      chrome.runtime.sendMessage({
        action: 'log',
        message: `Page ${pageNum}: found ${rows.length} backlinks`
      });

      if (rows.length > 0) {
        allData = allData.concat(rows);
        chrome.runtime.sendMessage({ action: 'backlinkData', data: rows, page: pageNum });
      }

      const hasNext = await goNextPage();
      if (!hasNext) break;
      pageNum++;

      // Random delay between pages (2-5s)
      await new Promise(r => setTimeout(r, 2000 + Math.random() * 3000));
    }

    chrome.runtime.sendMessage({
      action: 'scrapingComplete',
      total: allData.length,
      pages: pageNum
    });
    isScanning = false;
  }

  // Listen for commands from popup/background
  chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    if (msg.action === 'startScraping') {
      startScraping();
      sendResponse({ ok: true });
    } else if (msg.action === 'stopScraping') {
      isScanning = false;
      sendResponse({ ok: true });
    } else if (msg.action === 'ping') {
      sendResponse({ ok: true, page: 'semrush-scraper' });
    }
    return true;
  });

  console.log('[Backlink Tool] Semrush scraper loaded');
})();
