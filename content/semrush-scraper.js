// Semrush Backlink Scraper — Content Script
// Injected on semrush.com/analytics/backlinks/* pages
(() => {
  let isScanning = false;

  // Parse backlink rows from the Semrush table
  function parseTable() {
    const results = [];
    // Semrush uses custom div-based table with dynamic class names like ___SRow_XXXX_gg_
    // Find all row elements by matching class pattern
    const allDivs = document.querySelectorAll('div[class*="___SRow_"][class*="_gg_"]');
    
    // Filter to only data rows (inside the scroll container, not breadcrumb rows)
    const rows = [...allDivs].filter(div => {
      // Data rows contain links to external sites
      const hasExternalLink = div.querySelector('a[href*="http"]');
      // Data rows are inside a container with SContainer or SScrollArea class
      const inTable = div.closest('div[class*="___SContainer_"], div[class*="___SScrollArea_"]');
      return hasExternalLink && inTable;
    });

    rows.forEach(row => {
      // Find all child flex containers (cells)
      const cells = row.querySelectorAll(':scope > div[class*="___"]');
      
      // Get the referring page URL - first external link in the row
      const linkEl = row.querySelector('a[href*="http"]:not([href*="semrush"])');
      const url = linkEl?.href || '';
      
      // Get anchor text - look for the anchor/target URL section
      const allLinks = row.querySelectorAll('a[href*="http"]');
      let anchor = '';
      // The anchor text is usually in the second major link group
      allLinks.forEach(a => {
        const text = a.textContent?.trim();
        if (text && !text.includes('/') && text.length > 1 && text.length < 200) {
          anchor = text;
        }
      });

      // Authority score — find standalone numbers (AS score is typically 1-100)
      let authority = 0;
      const textNodes = row.querySelectorAll('span, div');
      for (const node of textNodes) {
        const text = node.textContent?.trim();
        if (/^\d{1,3}$/.test(text)) {
          const num = parseInt(text);
          if (num > 0 && num <= 100) {
            authority = num;
            break;
          }
        }
      }

      // Follow type — check for nofollow/ugc/sponsored badges
      const fullText = row.textContent || '';
      const linkType = /nofollow/i.test(fullText) ? 'nofollow' : 'dofollow';

      if (url && (url.startsWith('http') || url.includes('.'))) {
        results.push({ url: url.trim(), anchor_text: anchor, authority_score: authority, link_type: linkType });
      }
    });

    // Fallback: if div-based parsing found nothing, try standard table
    if (results.length === 0) {
      const tableRows = document.querySelectorAll('table tbody tr');
      tableRows.forEach(row => {
        const cells = row.querySelectorAll('td');
        if (cells.length < 3) return;
        const linkEl = cells[0]?.querySelector('a[href]');
        const url = linkEl?.href || '';
        const anchor = cells[1]?.textContent?.trim() || '';
        let authority = 0;
        for (const cell of cells) {
          const num = parseInt(cell.textContent?.trim());
          if (num > 0 && num <= 100) { authority = num; break; }
        }
        const fullText = row.textContent || '';
        const linkType = /nofollow/i.test(fullText) ? 'nofollow' : 'dofollow';
        if (url && url.startsWith('http')) {
          results.push({ url: url.trim(), anchor_text: anchor, authority_score: authority, link_type: linkType });
        }
      });
    }

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
      'button[aria-label="Next page"], button[aria-label="下一页"], button[data-test="next-page"], [class*="___SPagination"] button:last-child, [class*="Pagination"] button:last-of-type'
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
