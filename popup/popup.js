/**
 * FlexyPe Store Diagnostics – Popup Controller
 * ══════════════════════════════════════════════
 * Communicates with the background service worker, receives diagnostic
 * data, and renders it into the tabbed UI.
 */

document.addEventListener('DOMContentLoaded', () => {
  // ── DOM references ──────────────────────────────────────────────────
  const stateLoading     = document.getElementById('state-loading');
  const stateError       = document.getElementById('state-error');
  const stateNotShopify  = document.getElementById('state-not-shopify');
  const stateContent     = document.getElementById('state-content');
  const errorMessage     = document.getElementById('error-message');
  const currentUrlDisp   = document.getElementById('current-url-display');
  const btnRefresh       = document.getElementById('btn-refresh');
  const footer           = document.getElementById('footer');
  const scanTimestamp    = document.getElementById('scan-timestamp');
  const btnCopyReport    = document.getElementById('btn-copy-report');

  // Tab elements
  const tabNav     = document.getElementById('tab-nav');
  const tabButtons = document.querySelectorAll('.tab-btn');

  // Overview panel
  const storeName       = document.getElementById('store-name');
  const storeUrl        = document.getElementById('store-url');
  const storePageBadge  = document.getElementById('store-page-badge');
  const infoGrid        = document.getElementById('info-grid');
  const productPills    = document.getElementById('product-pills');
  const featuresGrid    = document.getElementById('features-grid');

  // Badges
  const badgeProducts = document.getElementById('badge-products');
  const badgeDisabled = document.getElementById('badge-disabled');
  const badgeApps     = document.getElementById('badge-apps');

  // Panels
  const productsList  = document.getElementById('products-list');
  const disabledList  = document.getElementById('disabled-list');
  const appsList      = document.getElementById('apps-list');
  const configList    = document.getElementById('config-list');

  // Keep a reference for clipboard
  let lastDiagnostics = null;


  // ── TAB SWITCHING ───────────────────────────────────────────────────
  tabButtons.forEach(btn => {
    btn.addEventListener('click', () => {
      const target = btn.dataset.tab;

      // Switch active tab button
      tabButtons.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');

      // Switch visible panel
      document.querySelectorAll('.tab-content').forEach(p => p.classList.add('hidden'));
      document.getElementById('panel-' + target).classList.remove('hidden');
    });
  });


  // ── REFRESH ─────────────────────────────────────────────────────────
  btnRefresh.addEventListener('click', runDiagnostics);


  // ── COPY REPORT ─────────────────────────────────────────────────────
  btnCopyReport.addEventListener('click', () => {
    if (!lastDiagnostics) return;
    const report = buildTextReport(lastDiagnostics);
    navigator.clipboard.writeText(report).then(() => {
      btnCopyReport.classList.add('copied');
      btnCopyReport.innerHTML = `
        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"/></svg>
        Copied!
      `;
      setTimeout(() => {
        btnCopyReport.classList.remove('copied');
        btnCopyReport.innerHTML = `
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
          Copy Report
        `;
      }, 2000);
    });
  });


  // ── RUN DIAGNOSTICS ─────────────────────────────────────────────────
  function runDiagnostics() {
    showView('loading');
    btnRefresh.classList.add('spinning');

    chrome.runtime.sendMessage({ type: 'GET_DIAGNOSTICS' }, (response) => {
      btnRefresh.classList.remove('spinning');

      if (chrome.runtime.lastError) {
        showView('error');
        errorMessage.textContent = chrome.runtime.lastError.message || 'Extension communication error.';
        return;
      }

      if (!response) {
        showView('error');
        errorMessage.textContent = 'No response from background script.';
        return;
      }

      if (response.error) {
        // Check if it's a non-web-page error
        if (response.error.includes('Cannot access') ||
            response.error.includes('chrome://') ||
            response.error.includes('Missing host permission')) {
          showView('not-shopify');
          currentUrlDisp.textContent = response.tabUrl || 'N/A';
          return;
        }
        showView('error');
        errorMessage.textContent = response.error;
        return;
      }

      const data = response.data;

      if (!data.isShopify) {
        showView('not-shopify');
        currentUrlDisp.textContent = response.tabUrl || window.location.href;
        return;
      }

      lastDiagnostics = data;
      renderDiagnostics(data);
      showView('content');
      footer.style.display = 'flex';
    });
  }


  // ── RENDER ──────────────────────────────────────────────────────────
  function renderDiagnostics(data) {
    const info = data.storeInfo;

    // -- Store banner --
    storeName.textContent     = info.shopName || info.storeUrl || '—';
    storeUrl.textContent      = info.storeUrl || '—';
    storePageBadge.textContent = info.currentPage || '—';

    // -- Timestamp --
    const ts = new Date(data.timestamp);
    scanTimestamp.textContent = 'Scanned ' + ts.toLocaleTimeString();

    // -- Info grid --
    const gridItems = [
      { label: 'Currency',       value: info.baseCurrency || 'N/A' },
      { label: 'Locale',         value: info.locale || 'N/A' },
      { label: 'Country',        value: info.country || 'N/A' },
      { label: 'Theme',          value: info.themeName || 'N/A' },
      { label: 'Shopify Domain', value: info.myshopifyDomain || 'N/A', mono: true },
      { label: 'CDN Host',       value: info.cdnHost || 'N/A', mono: true }
    ];

    infoGrid.innerHTML = gridItems.map(item => `
      <div class="info-cell">
        <div class="info-label">${item.label}</div>
        <div class="info-value${item.mono ? ' mono' : ''}">${escapeHtml(item.value)}</div>
      </div>
    `).join('');

    // -- Product pills (overview) --
    const products = [
      { key: 'checkout',  name: 'FlexyPe Checkout', icon: '⚡', iconClass: 'checkout' },
      { key: 'flexypass', name: 'FlexyPass',        icon: '🛡️', iconClass: 'flexypass' },
      { key: 'flexycart', name: 'FlexyCart',        icon: '🛒', iconClass: 'flexycart' }
    ];

    let activeCount = 0;
    productPills.innerHTML = products.map(p => {
      const pd = data.flexypeProducts[p.key];
      const isActive = pd.detected;
      if (isActive) activeCount++;

      const badgeClass = isActive
        ? (pd.confidence === 'high' ? 'active' : 'low')
        : 'not-detected';

      const badgeText = isActive
        ? (pd.confidence === 'high' ? 'Active' : 'Likely Active')
        : 'Not Detected';

      return `
        <div class="product-pill">
          <div class="product-pill-left">
            <div class="product-pill-icon ${p.iconClass}">${p.icon}</div>
            <div class="product-pill-name">${p.name}</div>
          </div>
          <div class="status-badge ${badgeClass}">
            <span class="status-dot${isActive ? ' pulse' : ''}"></span>
            ${badgeText}
          </div>
        </div>
      `;
    }).join('');

    badgeProducts.textContent = activeCount;

    // -- Products detail panel --
    productsList.innerHTML = products.map(p => {
      const pd = data.flexypeProducts[p.key];
      const isActive = pd.detected;

      if (!isActive) {
        return `
          <div class="product-card not-detected">
            <div class="product-card-header">
              <div class="product-card-header-left">
                <div class="product-pill-icon ${p.iconClass}">${p.icon}</div>
                <span class="product-card-name">${p.name}</span>
              </div>
              <span class="status-badge not-detected">Not Detected</span>
            </div>
            <div class="not-detected-text">No signals were found for this product on the current page.</div>
          </div>
        `;
      }

      const signalHTML = pd.signals.map(s => `
        <div class="signal-item">
          <span class="signal-type-badge ${s.type}">${formatSignalType(s.type)}</span>
          <span class="signal-detail">${escapeHtml(s.detail || s.value || '')}</span>
        </div>
      `).join('');

      return `
        <div class="product-card" data-product="${p.key}">
          <div class="product-card-header">
            <div class="product-card-header-left">
              <div class="product-pill-icon ${p.iconClass}">${p.icon}</div>
              <span class="product-card-name">${p.name}</span>
              <span class="confidence-badge ${pd.confidence}">${pd.confidence} confidence</span>
            </div>
            <svg class="product-card-chevron" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="6 9 12 15 18 9"/></svg>
          </div>
          <div class="product-card-body">
            <div class="signal-list">
              ${signalHTML}
            </div>
          </div>
        </div>
      `;
    }).join('');

    // Add click listeners for product accordions
    productsList.querySelectorAll('.product-card-header').forEach(header => {
      header.addEventListener('click', () => {
        header.parentElement.classList.toggle('expanded');
      });
    });

    // Expand the first active product by default
    const firstActive = productsList.querySelector('.product-card:not(.not-detected)');
    if (firstActive) firstActive.classList.add('expanded');

    // -- Disabled integrations panel --
    const disabledItems = data.disabledIntegrations || [];
    badgeDisabled.textContent = disabledItems.length;

    if (disabledItems.length === 0) {
      disabledList.innerHTML = `
        <div class="empty-state">
          <div class="empty-state-icon">✅</div>
          <div class="empty-state-title">No Disabled Integrations</div>
          <div class="empty-state-msg">No commented-out or hidden FlexyPe code was found.</div>
        </div>
      `;
    } else {
      disabledList.innerHTML = disabledItems.map(item => `
        <div class="disabled-card">
          <span class="disabled-card-type">${formatDisabledType(item.type)}</span>
          <div class="disabled-card-desc">${escapeHtml(item.description)}</div>
          ${item.reason ? `<div class="disabled-card-reason">💡 ${escapeHtml(item.reason)}</div>` : ''}
          <div class="disabled-snippet">${escapeHtml(item.snippet || '')}</div>
        </div>
      `).join('');
    }

    // -- Third-party apps panel --
    const apps = data.thirdPartyApps || [];
    badgeApps.textContent = apps.length;

    if (apps.length === 0) {
      appsList.innerHTML = `
        <div class="empty-state">
          <div class="empty-state-icon">📦</div>
          <div class="empty-state-title">No Third-Party Apps Detected</div>
          <div class="empty-state-msg">No known third-party Shopify apps were found.</div>
        </div>
      `;
    } else {
      appsList.innerHTML = apps.map(app => `
        <div class="app-item">
          <span class="app-name">${escapeHtml(app.name)}</span>
          <span class="app-signal-count">${app.signals.length} signal${app.signals.length !== 1 ? 's' : ''}</span>
        </div>
      `).join('');
    }

    // -- Features grid --
    const features = [
      { key: 'hasCart',             label: 'Cart' },
      { key: 'hasSearch',           label: 'Search' },
      { key: 'hasWishlist',         label: 'Wishlist' },
      { key: 'hasReviews',          label: 'Reviews' },
      { key: 'hasCurrencySwitcher', label: 'Currency Switcher' },
      { key: 'hasLiveChat',         label: 'Live Chat' },
      { key: 'hasAnalytics',        label: 'Analytics' },
      { key: 'shopifyPayments',     label: 'Shopify Payments' }
    ];

    featuresGrid.innerHTML = features.map(f => {
      const active = data.pageFeatures[f.key];
      return `
        <div class="feature-chip${active ? ' yes' : ''}">
          <span class="feature-dot"></span>
          ${f.label}
        </div>
      `;
    }).join('');

    // -- Config panel (Bonus) --
    renderConfigPanel(data.productConfigs || {});
  }


  // ── CONFIG PANEL RENDERER (Bonus) ──────────────────────────────────
  function renderConfigPanel(configs) {
    const productMeta = [
      { key: 'checkout',  name: 'FlexyPe Checkout', icon: '⚡', iconClass: 'checkout' },
      { key: 'flexypass', name: 'FlexyPass',        icon: '🛡️', iconClass: 'flexypass' },
      { key: 'flexycart', name: 'FlexyCart',        icon: '🛒', iconClass: 'flexycart' }
    ];

    const hasAny = Object.keys(configs).length > 0;

    if (!hasAny) {
      configList.innerHTML = `
        <div class="empty-state">
          <div class="empty-state-icon">⚙️</div>
          <div class="empty-state-title">No Configuration Found</div>
          <div class="empty-state-msg">No FlexyPe product configuration was detected on this page. Configs are extracted from window globals set by FlexyPe scripts.</div>
        </div>
      `;
      return;
    }

    configList.innerHTML = productMeta.map(p => {
      const cfg = configs[p.key];
      if (!cfg) {
        return `
          <div class="product-card not-detected" style="margin-bottom:8px;">
            <div class="product-card-header">
              <div class="product-card-header-left">
                <div class="product-pill-icon ${p.iconClass}">${p.icon}</div>
                <span class="product-card-name">${p.name}</span>
              </div>
              <span class="status-badge not-detected">No Config</span>
            </div>
          </div>
        `;
      }

      const jsonStr = JSON.stringify(cfg, null, 2);

      // Recursively count all keys for a more accurate badge number
      function countAllKeys(obj) {
        let count = 0;
        if (typeof obj === 'object' && obj !== null && !Array.isArray(obj)) {
          for (let k in obj) {
            count++;
            count += countAllKeys(obj[k]);
          }
        }
        return count;
      }
      
      const totalKeys = countAllKeys(cfg);
      const keyText = totalKeys === 1 ? '1 key' : totalKeys + ' keys';

      return `
        <div class="product-card" style="margin-bottom:8px;">
          <div class="product-card-header">
            <div class="product-card-header-left">
              <div class="product-pill-icon ${p.iconClass}">${p.icon}</div>
              <span class="product-card-name">${p.name}</span>
              <span class="confidence-badge high">${keyText}</span>
            </div>
            <svg class="product-card-chevron" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="6 9 12 15 18 9"/></svg>
          </div>
          <div class="product-card-body">
            <div style="padding: 0 14px 12px;">
              <div class="config-json">${escapeHtml(jsonStr)}</div>
            </div>
          </div>
        </div>
      `;
    }).join('');

    // Add click listeners for config accordions
    configList.querySelectorAll('.product-card-header').forEach(header => {
      header.addEventListener('click', () => {
        header.parentElement.classList.toggle('expanded');
      });
    });

    // Auto-expand the first config card that has data
    const firstConfig = configList.querySelector('.product-card:not(.not-detected)');
    if (firstConfig) firstConfig.classList.add('expanded');
  }


  // ── HELPERS ─────────────────────────────────────────────────────────

  function showView(view) {
    stateLoading.classList.add('hidden');
    stateError.classList.add('hidden');
    stateNotShopify.classList.add('hidden');
    stateContent.classList.add('hidden');
    footer.style.display = 'none';

    switch (view) {
      case 'loading':     stateLoading.classList.remove('hidden'); break;
      case 'error':       stateError.classList.remove('hidden'); break;
      case 'not-shopify': stateNotShopify.classList.remove('hidden'); break;
      case 'content':     stateContent.classList.remove('hidden'); break;
    }
  }

  function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }

  function formatSignalType(type) {
    const map = {
      'script_url':        'Script',
      'global_variable':   'Global',
      'dom_element':       'DOM',
      'inline_script':     'Inline JS',
      'html_marker':       'HTML',
      'shopify_app_block': 'App Block',
      'api_endpoint':      'API',
      'stylesheet':        'CSS',
      'local_storage':     'Storage',
      'meta_tag':          'Meta'
    };
    return map[type] || type;
  }

  function formatDisabledType(type) {
    const map = {
      'html_comment':    'HTML Comment',
      'commented_js':    'JS Comment',
      'disabled_script': 'Disabled Script',
      'hidden_element':  'Hidden Element',
      'liquid_comment':  'Liquid Comment'
    };
    return map[type] || type;
  }


  // ── TEXT REPORT (for clipboard) ─────────────────────────────────────
  function buildTextReport(data) {
    const info = data.storeInfo;
    let report = '═══ FlexyPe Store Diagnostics Report ═══\n\n';

    report += '── Store Information ──\n';
    report += `Store URL:       ${info.storeUrl}\n`;
    report += `Shop Name:       ${info.shopName}\n`;
    report += `Currency:        ${info.baseCurrency || 'N/A'}\n`;
    report += `Country:         ${info.country || 'N/A'}\n`;
    report += `Locale:          ${info.locale || 'N/A'}\n`;
    report += `Shopify Domain:  ${info.myshopifyDomain || 'N/A'}\n`;
    report += `Theme:           ${info.themeName || 'N/A'}\n`;
    report += `Current Page:    ${info.currentPage}\n`;
    report += '\n';

    report += '── FlexyPe Products ──\n';
    const products = [
      { key: 'checkout',  name: 'FlexyPe Checkout' },
      { key: 'flexypass', name: 'FlexyPass' },
      { key: 'flexycart', name: 'FlexyCart' }
    ];

    products.forEach(p => {
      const pd = data.flexypeProducts[p.key];
      const status = pd.detected ? `✅ ACTIVE (${pd.confidence} confidence, ${pd.signals.length} signals)` : '❌ Not Detected';
      report += `${p.name}: ${status}\n`;
      if (pd.detected) {
        pd.signals.forEach(s => {
          report += `  • [${s.type}] ${s.detail || s.value || ''}\n`;
        });
      }
    });
    report += '\n';

    if (data.disabledIntegrations.length > 0) {
      report += '── Disabled Integrations ──\n';
      data.disabledIntegrations.forEach(d => {
        report += `[${d.type}] ${d.description}\n`;
        if (d.reason) report += `  Reason: ${d.reason}\n`;
        if (d.snippet) report += `  Snippet: ${d.snippet.substring(0, 150)}\n`;
        report += '\n';
      });
    }

    if (data.thirdPartyApps.length > 0) {
      report += '── Third-Party Apps ──\n';
      data.thirdPartyApps.forEach(a => {
        report += `• ${a.name} (${a.signals.length} signal${a.signals.length !== 1 ? 's' : ''})\n`;
      });
      report += '\n';
    }

    report += `\nScanned at: ${data.timestamp}\n`;
    return report;
  }


  // ── INITIAL RUN ─────────────────────────────────────────────────────
  runDiagnostics();
});
