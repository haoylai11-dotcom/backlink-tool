// Comment Detector — injected on demand to analyze a page for comment capability
(() => {
  function detect() {
    const result = {
      comment_status: 'no_comment',
      has_url_field: false,
      needs_login: false,
      has_captcha: false,
      form_selector: null,
      url_field_selector: null,
      page_title: document.title || '',
      page_content: '',
      discovered_urls: []
    };

    // Get article content (first 500 chars)
    const article = document.querySelector('article, .post-content, .entry-content, .article-content, main');
    if (article) {
      result.page_content = article.textContent.replace(/\s+/g, ' ').trim().substring(0, 500);
    } else {
      const body = document.body?.textContent || '';
      result.page_content = body.replace(/\s+/g, ' ').trim().substring(0, 500);
    }

    // Find comment forms
    const formSelectors = [
      'form[action*="comment"]',
      'form#commentform',
      'form.comment-form',
      '#respond form',
      '.comments-area form',
      'form[action*="wp-comments-post"]'
    ];

    let form = null;
    for (const sel of formSelectors) {
      form = document.querySelector(sel);
      if (form) { result.form_selector = sel; break; }
    }

    // Also check for textarea with comment-related attributes
    if (!form) {
      const textareas = document.querySelectorAll('textarea');
      for (const ta of textareas) {
        const name = (ta.name || '').toLowerCase();
        const id = (ta.id || '').toLowerCase();
        const placeholder = (ta.placeholder || '').toLowerCase();
        if (name.includes('comment') || id.includes('comment') || placeholder.includes('comment') || placeholder.includes('reply')) {
          form = ta.closest('form');
          if (form) { result.form_selector = 'form'; break; }
        }
      }
    }

    if (!form) {
      // Check for Disqus or other third-party comment systems
      if (document.querySelector('#disqus_thread, iframe[src*="disqus"]')) {
        result.comment_status = 'no_comment'; // Disqus = nofollow, skip
        return result;
      }
      return result;
    }

    // Found a form — check for URL/website field
    const urlSelectors = [
      'input[name="url"]',
      'input[name="website"]',
      'input[name="homepage"]',
      'input[id="url"]',
      'input[id="website"]'
    ];

    for (const sel of urlSelectors) {
      const el = form.querySelector(sel) || document.querySelector(sel);
      if (el) {
        result.has_url_field = true;
        result.url_field_selector = sel;
        break;
      }
    }

    // Also check by placeholder text
    if (!result.has_url_field) {
      const inputs = form.querySelectorAll('input[type="text"], input[type="url"], input:not([type])');
      for (const inp of inputs) {
        const ph = (inp.placeholder || '').toLowerCase();
        const name = (inp.name || '').toLowerCase();
        if (ph.includes('website') || ph.includes('url') || ph.includes('homepage') || name.includes('url') || name.includes('website')) {
          result.has_url_field = true;
          result.url_field_selector = `input[name="${inp.name}"]` || `input[placeholder="${inp.placeholder}"]`;
          break;
        }
      }
    }

    // Check for login wall
    const pageText = document.body?.textContent?.toLowerCase() || '';
    const loginPatterns = [
      'log in to comment', 'login to comment', 'login to post',
      'you must be logged in', 'sign in to comment', 'please log in',
      'log in to leave a comment', 'login to reply'
    ];
    result.needs_login = loginPatterns.some(p => pageText.includes(p));

    // Also check if form is hidden
    if (form) {
      const style = window.getComputedStyle(form);
      if (style.display === 'none' || style.visibility === 'hidden') {
        result.needs_login = true;
      }
    }

    // Check for CAPTCHA
    result.has_captcha = !!(
      document.querySelector('iframe[src*="recaptcha"], iframe[src*="hcaptcha"], .g-recaptcha, .h-captcha, [data-sitekey]')
    );

    // Determine final status
    if (result.needs_login) {
      result.comment_status = 'needs_login';
    } else if (result.has_captcha) {
      result.comment_status = 'has_captcha';
    } else if (result.has_url_field) {
      result.comment_status = 'commentable';
    } else {
      result.comment_status = 'commentable'; // Has form but no URL field — still can post
    }

    // Discover other commenters' website URLs
    const commentLinks = document.querySelectorAll(
      '.comment-author a[href], .comment-meta a[href], .vcard a[href], .comment-author-link a[href], .fn a[href]'
    );

    const currentDomain = window.location.hostname;
    const skipDomains = ['facebook.com', 'twitter.com', 'instagram.com', 'linkedin.com', 'youtube.com', 'google.com', 'gravatar.com', 'wordpress.org', 'wordpress.com'];

    commentLinks.forEach(link => {
      try {
        const href = link.href;
        if (!href || !href.startsWith('http')) return;
        const linkDomain = new URL(href).hostname;
        if (linkDomain === currentDomain) return;
        if (skipDomains.some(d => linkDomain.includes(d))) return;
        if (!result.discovered_urls.includes(href)) {
          result.discovered_urls.push(href);
        }
      } catch (e) { /* invalid URL */ }
    });

    return result;
  }

  // Run detection and send result back
  const result = detect();
  chrome.runtime.sendMessage({ action: 'detectResult', data: result });
})();
