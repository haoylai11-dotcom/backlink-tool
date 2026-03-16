// Comment Poster — injected on demand to fill and submit a comment form
(() => {
  // Receive posting config from background
  chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    if (msg.action === 'postComment') {
      doPost(msg.data).then(result => {
        chrome.runtime.sendMessage({ action: 'postResult', data: result });
      });
      sendResponse({ ok: true });
    }
    return true;
  });

  async function typeSlowly(el, text) {
    el.focus();
    el.value = '';
    el.dispatchEvent(new Event('focus', { bubbles: true }));
    for (const char of text) {
      el.value += char;
      el.dispatchEvent(new Event('input', { bubbles: true }));
      el.dispatchEvent(new KeyboardEvent('keydown', { key: char, bubbles: true }));
      el.dispatchEvent(new KeyboardEvent('keyup', { key: char, bubbles: true }));
      await new Promise(r => setTimeout(r, 30 + Math.random() * 50));
    }
    el.dispatchEvent(new Event('change', { bubbles: true }));
    el.dispatchEvent(new Event('blur', { bubbles: true }));
  }

  async function doPost(data) {
    const { name, email, website, comment, formSelector, urlFieldSelector } = data;
    const result = { status: 'failed', message: '' };

    try {
      // Find the form
      const form = document.querySelector(formSelector || 'form[action*="comment"], form#commentform, #respond form, form[action*="wp-comments-post"]');
      if (!form) {
        result.message = 'Comment form not found';
        return result;
      }

      // Check for CAPTCHA
      if (document.querySelector('iframe[src*="recaptcha"], .g-recaptcha, .h-captcha')) {
        result.status = 'captcha_blocked';
        result.message = 'CAPTCHA detected — needs manual intervention';
        return result;
      }

      // Fill author name
      const nameField = form.querySelector('input[name="author"], input[name="name"], input#author');
      if (nameField) await typeSlowly(nameField, name);

      await new Promise(r => setTimeout(r, 300 + Math.random() * 500));

      // Fill email
      const emailField = form.querySelector('input[name="email"], input[type="email"], input#email');
      if (emailField) await typeSlowly(emailField, email);

      await new Promise(r => setTimeout(r, 300 + Math.random() * 500));

      // Fill website URL
      const urlField = form.querySelector(urlFieldSelector || 'input[name="url"], input[name="website"], input#url');
      if (urlField) await typeSlowly(urlField, website);

      await new Promise(r => setTimeout(r, 300 + Math.random() * 500));

      // Fill comment text
      const commentField = form.querySelector('textarea[name="comment"], textarea#comment, textarea');
      if (!commentField) {
        result.message = 'Comment textarea not found';
        return result;
      }
      await typeSlowly(commentField, comment);

      await new Promise(r => setTimeout(r, 500 + Math.random() * 1000));

      // Find and click submit
      const submitBtn = form.querySelector('input[type="submit"], button[type="submit"], #submit, button[name="submit"]');
      if (!submitBtn) {
        result.message = 'Submit button not found';
        return result;
      }

      submitBtn.click();

      // Wait and check result (3 seconds)
      await new Promise(r => setTimeout(r, 3000));

      const pageText = document.body.textContent.toLowerCase();
      if (pageText.includes('awaiting moderation') || pageText.includes('comment is awaiting') || pageText.includes('pending approval')) {
        result.status = 'awaiting_moderation';
        result.message = 'Comment submitted, awaiting moderation';
      } else if (pageText.includes('duplicate comment') || pageText.includes('already said that')) {
        result.status = 'failed';
        result.message = 'Duplicate comment detected';
      } else if (pageText.includes('error') && pageText.includes('comment')) {
        result.status = 'failed';
        result.message = 'Error posting comment';
      } else {
        // Check if comment appears on page
        const comments = document.querySelectorAll('.comment, .comment-body, li.comment');
        const lastComment = comments[comments.length - 1];
        if (lastComment && lastComment.textContent.includes(comment.substring(0, 30))) {
          result.status = 'posted';
          result.message = 'Comment posted successfully';
        } else {
          result.status = 'awaiting_moderation';
          result.message = 'Comment submitted (likely awaiting moderation)';
        }
      }
    } catch (err) {
      result.message = `Error: ${err.message}`;
    }

    return result;
  }

  console.log('[Backlink Tool] Comment poster loaded');
})();
