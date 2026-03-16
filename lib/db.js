// IndexedDB wrapper for Backlink Tool
const DB = (() => {
  const DB_NAME = 'backlink_tool';
  const DB_VERSION = 1;
  let db = null;

  function init() {
    return new Promise((resolve, reject) => {
      if (db) return resolve(db);
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = (e) => {
        const d = e.target.result;

        if (!d.objectStoreNames.contains('domains')) {
          const s = d.createObjectStore('domains', { keyPath: 'id', autoIncrement: true });
          s.createIndex('domain', 'domain', { unique: false });
          s.createIndex('status', 'status', { unique: false });
          s.createIndex('depth', 'depth', { unique: false });
        }

        if (!d.objectStoreNames.contains('backlinks')) {
          const s = d.createObjectStore('backlinks', { keyPath: 'id', autoIncrement: true });
          s.createIndex('domain_id', 'domain_id', { unique: false });
          s.createIndex('url', 'url', { unique: false });
          s.createIndex('comment_status', 'comment_status', { unique: false });
        }

        if (!d.objectStoreNames.contains('discovered_sites')) {
          const s = d.createObjectStore('discovered_sites', { keyPath: 'id', autoIncrement: true });
          s.createIndex('domain', 'domain', { unique: false });
          s.createIndex('checked', 'checked', { unique: false });
        }

        if (!d.objectStoreNames.contains('comments')) {
          const s = d.createObjectStore('comments', { keyPath: 'id', autoIncrement: true });
          s.createIndex('backlink_id', 'backlink_id', { unique: false });
          s.createIndex('status', 'status', { unique: false });
        }
      };
      req.onsuccess = (e) => { db = e.target.result; resolve(db); };
      req.onerror = (e) => reject(e.target.error);
    });
  }

  function _getStore(name, mode = 'readonly') {
    return db.transaction(name, mode).objectStore(name);
  }

  function _reqToPromise(req) {
    return new Promise((resolve, reject) => {
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }

  function _getAll(storeName, filter) {
    return new Promise((resolve, reject) => {
      const store = _getStore(storeName);
      let req;
      if (filter && filter.indexName && filter.value !== undefined) {
        req = store.index(filter.indexName).getAll(filter.value);
      } else {
        req = store.getAll();
      }
      req.onsuccess = () => {
        let results = req.result;
        if (filter && filter.fn) results = results.filter(filter.fn);
        resolve(results);
      };
      req.onerror = () => reject(req.error);
    });
  }

  async function addDomain(data) {
    await init();
    data.created_at = data.created_at || Date.now();
    data.status = data.status || 'pending';
    return _reqToPromise(_getStore('domains', 'readwrite').add(data));
  }

  async function getDomains(filter) {
    await init();
    return _getAll('domains', filter);
  }

  async function updateDomain(id, data) {
    await init();
    const store = _getStore('domains', 'readwrite');
    const existing = await _reqToPromise(store.get(id));
    if (!existing) return null;
    Object.assign(existing, data);
    return _reqToPromise(store.put(existing));
  }

  async function addBacklink(data) {
    await init();
    data.comment_status = data.comment_status || 'unchecked';
    data.checked_at = null;
    return _reqToPromise(_getStore('backlinks', 'readwrite').add(data));
  }

  async function getBacklinks(filter) {
    await init();
    return _getAll('backlinks', filter);
  }

  async function updateBacklink(id, data) {
    await init();
    const store = _getStore('backlinks', 'readwrite');
    const existing = await _reqToPromise(store.get(id));
    if (!existing) return null;
    Object.assign(existing, data);
    return _reqToPromise(store.put(existing));
  }

  async function addDiscoveredSite(data) {
    await init();
    data.checked = false;
    data.created_at = data.created_at || Date.now();
    return _reqToPromise(_getStore('discovered_sites', 'readwrite').add(data));
  }

  async function getDiscoveredSites(filter) {
    await init();
    return _getAll('discovered_sites', filter);
  }

  async function updateDiscoveredSite(id, data) {
    await init();
    const store = _getStore('discovered_sites', 'readwrite');
    const existing = await _reqToPromise(store.get(id));
    if (!existing) return null;
    Object.assign(existing, data);
    return _reqToPromise(store.put(existing));
  }

  async function addComment(data) {
    await init();
    data.status = data.status || 'pending';
    data.posted_at = null;
    return _reqToPromise(_getStore('comments', 'readwrite').add(data));
  }

  async function getComments(filter) {
    await init();
    return _getAll('comments', filter);
  }

  async function updateComment(id, data) {
    await init();
    const store = _getStore('comments', 'readwrite');
    const existing = await _reqToPromise(store.get(id));
    if (!existing) return null;
    Object.assign(existing, data);
    return _reqToPromise(store.put(existing));
  }

  async function getStats() {
    await init();
    const [domains, backlinks, discovered, comments] = await Promise.all([
      _getAll('domains'), _getAll('backlinks'),
      _getAll('discovered_sites'), _getAll('comments')
    ]);
    return {
      domains: { total: domains.length, pending: domains.filter(d => d.status === 'pending').length, scraped: domains.filter(d => d.status === 'scraped').length },
      backlinks: { total: backlinks.length, unchecked: backlinks.filter(b => b.comment_status === 'unchecked').length, commentable: backlinks.filter(b => b.comment_status === 'commentable').length, no_comment: backlinks.filter(b => b.comment_status === 'no_comment').length },
      discovered: { total: discovered.length, unchecked: discovered.filter(d => !d.checked).length },
      comments: { total: comments.length, posted: comments.filter(c => c.status === 'posted').length, pending: comments.filter(c => c.status === 'pending').length, failed: comments.filter(c => c.status === 'failed').length }
    };
  }

  async function clearAll() {
    await init();
    const names = ['domains', 'backlinks', 'discovered_sites', 'comments'];
    return Promise.all(names.map(name => {
      return new Promise((resolve, reject) => {
        const tx = db.transaction(name, 'readwrite');
        tx.objectStore(name).clear().onsuccess = resolve;
        tx.onerror = () => reject(tx.error);
      });
    }));
  }

  return { init, addDomain, getDomains, updateDomain, addBacklink, getBacklinks, updateBacklink, addDiscoveredSite, getDiscoveredSites, updateDiscoveredSite, addComment, getComments, updateComment, getStats, clearAll };
})();

// Make available in both content script and module contexts
if (typeof globalThis !== 'undefined') globalThis.DB = DB;
