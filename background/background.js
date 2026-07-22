/**
 * FlexyPe Store Diagnostics - Background Service Worker
 * ─────────────────────────────────────────────────────
 * Handles messaging between popup and content scripts.
 * Injects the diagnostic function into the page's MAIN world
 * so it can access window.Shopify and other globals.
 */

chrome.runtime.onInstalled.addListener(() => {
  console.log('[FlexyPe Diagnostics] Extension installed.');
});

// Listen for messages from the popup and content scripts
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  // Acknowledge content script ready signal
  if (message.type === 'CONTENT_READY') {
    sendResponse({ status: 'acknowledged' });
    return false;
  }

  if (message.type === 'GET_DIAGNOSTICS') {
    chrome.tabs.query({ active: true, currentWindow: true }, async (tabs) => {
      if (!tabs || tabs.length === 0) {
        sendResponse({ error: 'No active tab found.' });
        return;
      }

      const tab = tabs[0];

      try {
        // Execute the diagnostics function in the page's MAIN world
        const results = await chrome.scripting.executeScript({
          target: { tabId: tab.id },
          func: runPageDiagnostics,
          world: 'MAIN'
        });

        if (results && results[0] && results[0].result) {
          sendResponse({
            data: results[0].result,
            tabUrl: tab.url,
            tabTitle: tab.title
          });
        } else {
          sendResponse({ error: 'Could not retrieve diagnostics from page.' });
        }
      } catch (err) {
        sendResponse({ error: err.message || 'Script injection failed.' });
      }
    });

    return true; // Keep the message channel open for async sendResponse
  }
});


/**
 * ════════════════════════════════════════════════════════════════════════
 * MAIN WORLD DIAGNOSTIC FUNCTION
 * ════════════════════════════════════════════════════════════════════════
 * Serialised and injected into the page context.
 * Has full access to window.Shopify, window.FlexyPeCart, etc.
 *
 * Detection signals are derived from real-world FlexyPe integrations
 * observed on live Shopify storefronts (aseemshakti.com, zouraofficial.com).
 */
function runPageDiagnostics() {

  const result = {
    timestamp: new Date().toISOString(),
    isShopify: false,
    storeInfo: {},
    flexypeProducts: {
      checkout: { detected: false, signals: [], confidence: 'none' },
      flexypass: { detected: false, signals: [], confidence: 'none' },
      flexycart: { detected: false, signals: [], confidence: 'none' }
    },
    disabledIntegrations: [],
    thirdPartyApps: [],
    pageFeatures: {},
    productConfigs: {},
    rawScripts: []
  };

  try {

    // ─────────────────────────────────────────────────────────────────────
    //  PART 1 – STORE INFORMATION
    // ─────────────────────────────────────────────────────────────────────

    const shopify = window.Shopify;

    if (shopify) {
      result.isShopify = true;

      const shop    = shopify.shop || '';
      const theme   = shopify.theme || {};
      const currency = shopify.currency || {};
      const locale  = shopify.locale || document.documentElement.lang || '';
      const country = shopify.country || '';
      const cdnHost = shopify.cdnHost || '';

      // Derive a human-readable shop name from the myshopify domain
      let shopName = '';
      if (shop) {
        shopName = shop
          .replace('.myshopify.com', '')
          .replace(/-/g, ' ')
          .replace(/\b\w/g, c => c.toUpperCase());
      }
      // Fallback to document title
      if (!shopName) {
        shopName = (document.title.split('–')[0] || document.title.split('|')[0] || '').trim();
      }

      result.storeInfo = {
        storeUrl:        window.location.hostname,
        shopName:        shopName,
        baseCurrency:    typeof currency === 'object'
                            ? (currency.active || currency.rate || '')
                            : (currency || ''),
        country:         country,
        locale:          locale,
        myshopifyDomain: shop,
        shopifyDomain:   window.location.hostname,
        themeName:       theme.name || '',
        themeId:         theme.id || '',
        themeRole:       theme.role || '',
        currentPage:     detectCurrentPage(),
        cdnHost:         cdnHost
      };

    } else {
      // Fallback: detect Shopify without window.Shopify
      const scripts = Array.from(document.querySelectorAll('script[src]'));
      const hasShopifyCDN = scripts.some(s =>
        s.src.includes('cdn.shopify.com') ||
        s.src.includes('shopifycdn.com')  ||
        s.src.includes('myshopify.com')
      );
      const hasCheckoutMeta = !!document.querySelector('meta[name="shopify-checkout-api-token"]');
      const hasCartForm     = !!document.querySelector('form[action="/cart"]');

      if (hasShopifyCDN || hasCheckoutMeta || hasCartForm) {
        result.isShopify = true;
        result.storeInfo = {
          storeUrl:        window.location.hostname,
          shopName:        (document.title.split('–')[0] || document.title.split('|')[0] || '').trim(),
          baseCurrency:    '',
          country:         '',
          locale:          document.documentElement.lang || '',
          myshopifyDomain: '',
          shopifyDomain:   window.location.hostname,
          themeName:       '',
          themeId:         '',
          themeRole:       '',
          currentPage:     detectCurrentPage(),
          cdnHost:         ''
        };
      }
    }

    // ── Gather all script sources ────────────────────────────────────────
    const allScripts   = Array.from(document.querySelectorAll('script'));
    const allScriptSrcs = allScripts.filter(s => s.src).map(s => s.src);
    result.rawScripts   = allScriptSrcs.slice(0, 120);

    const inlineScripts = allScripts
      .filter(s => !s.src && s.textContent)
      .map(s => s.textContent);

    const fullHTML = document.documentElement.outerHTML;


    // ─────────────────────────────────────────────────────────────────────
    //  PART 2 – FLEXYPE PRODUCT DETECTION
    //  Using real signals from live stores.
    // ─────────────────────────────────────────────────────────────────────


    // ═══ 2a. FlexyPe Checkout ═══════════════════════════════════════════

    const checkoutSignals = [];

    // Signal A – Script URL patterns
    const coScriptPats = [
      /static\.flexype\.in/i,
      /flexype-v2/i,
      /flexype-v\d/i,
      /flexype\.in\/scripts/i,
      /flexype-checkout/i,
      /cdn\.flexype/i,
      /assets\.flexype/i
    ];
    allScriptSrcs.forEach(src => {
      coScriptPats.forEach(p => {
        if (p.test(src)) {
          checkoutSignals.push({ type: 'script_url', detail: src, pattern: p.source });
        }
      });
    });

    // Signal B – Window globals
    const coGlobals = [
      'openFlexyCheckout', 'handleFlexyBuyNow',
      'flexypeCheckoutReady', 'flexypeCheckoutFailed',
      'flexypeRegion', 'flexypeMid',
      'FlexyPe', 'flexype', 'flexyPe',
      'FlexyPeCheckout', 'fpCheckout'
    ];
    coGlobals.forEach(g => {
      if (typeof window[g] !== 'undefined') {
        checkoutSignals.push({ type: 'global_variable', detail: 'window.' + g, dataType: typeof window[g] });
      }
    });

    // Signal C – DOM elements
    const coSelectors = [
      '.flexy-btn',
      '[data-flexy-type]',
      '[data-flexy-type="buynow"]',
      '[data-flexy-type="checkout"]',
      '#flexype-checkout',
      '.flexype-checkout',
      '#fp-checkout',
      '.flexy-skeleton',
      '[data-flexype]'
    ];
    coSelectors.forEach(sel => {
      try {
        const els = document.querySelectorAll(sel);
        if (els.length > 0) {
          checkoutSignals.push({ type: 'dom_element', detail: sel, count: els.length });
        }
      } catch(_) {}
    });

    // Signal D – Inline script keywords
    const coKeywords = [
      /openFlexyCheckout/,
      /handleFlexyBuyNow/,
      /flexypeCheckoutReady/,
      /flexypeCheckoutFailed/,
      /flexype-v2\.min\.js/,
      /static\.flexype\.in/,
      /grade\.flexype\.net/,
      /flexype:checkout-ready/,
      /flexype:checkout-failed/
    ];
    inlineScripts.forEach((text, idx) => {
      coKeywords.forEach(kw => {
        if (kw.test(text)) {
          const m = text.match(kw);
          if (m) {
            const start = Math.max(0, m.index - 40);
            const snippet = text.substring(start, start + 120).replace(/\s+/g, ' ').trim();
            checkoutSignals.push({ type: 'inline_script', detail: snippet, keyword: kw.source });
          }
        }
      });
    });

    // Signal E – HTML comment markers (<!-- FlexyPe -->)
    if (/<!--\s*FlexyPe\s*-->/i.test(fullHTML)) {
      checkoutSignals.push({ type: 'html_marker', detail: '<!-- FlexyPe --> comment marker found in HTML' });
    }

    // Signal F – Link/style tags
    document.querySelectorAll('link[href*="flexype"], link[href*="flexy-pe"]').forEach(l => {
      checkoutSignals.push({ type: 'stylesheet', detail: l.href });
    });

    // Signal G – Shopify app block comments
    if (/shopify:\/\/apps\/flexype/i.test(fullHTML) || /shopify:\/\/apps\/flexy-checkout/i.test(fullHTML)) {
      checkoutSignals.push({ type: 'shopify_app_block', detail: 'FlexyPe Checkout app block detected in theme' });
    }

    // Signal H – Network/fetch to flexype domains (check from inline scripts)
    const coNetPats = [/grade\.flexype\.net/, /api\.flexype\.in/, /api\.flexype\.io/];
    inlineScripts.forEach(text => {
      coNetPats.forEach(p => {
        if (p.test(text)) {
          checkoutSignals.push({ type: 'api_endpoint', detail: 'API call to ' + p.source + ' found in inline script' });
        }
      });
    });

    // Deduplicate & set result
    const uniqueCheckout = deduplicateSignals(checkoutSignals);
    if (uniqueCheckout.length > 0) {
      result.flexypeProducts.checkout.detected = true;
      result.flexypeProducts.checkout.signals  = uniqueCheckout;
      result.flexypeProducts.checkout.confidence = uniqueCheckout.length >= 3 ? 'high'
                                                  : uniqueCheckout.length >= 1 ? 'medium' : 'low';
    }


    // ═══ 2b. FlexyPass ══════════════════════════════════════════════════

    const passSignals = [];

    // Signal A – Script URLs
    const passScriptPats = [
      /flexypass/i,
      /flexy-pass/i,
      /pass\.min\.js/i
    ];
    allScriptSrcs.forEach(src => {
      passScriptPats.forEach(p => {
        if (p.test(src)) {
          passSignals.push({ type: 'script_url', detail: src, pattern: p.source });
        }
      });
    });

    // Signal B – Window globals
    const passGlobals = [
      'flexyPassUser', 'flexyPassActive', 'flexyPassConsent',
      'flexyPassNewFlow', 'flexyPassAxentraConfig',
      'openFlexyPass', 'handleFlexyLogin',
      'FlexyPass', 'flexyPass'
    ];
    passGlobals.forEach(g => {
      if (typeof window[g] !== 'undefined') {
        passSignals.push({ type: 'global_variable', detail: 'window.' + g, dataType: typeof window[g] });
      }
    });

    // Signal C – DOM elements
    const passSelectors = [
      '#flexy-pass-header-wrapper',
      '#flexy-pass-sidebar-wrapper',
      '#flexy-pass-wrapper',
      '[data-flexy-pass]',
      '[data-flexy-pass="true"]',
      '#flexypass',
      '.flexypass',
      '#fp-pass',
      '.flexy-pass'
    ];
    passSelectors.forEach(sel => {
      try {
        const els = document.querySelectorAll(sel);
        if (els.length > 0) {
          passSignals.push({ type: 'dom_element', detail: sel, count: els.length });
        }
      } catch(_) {}
    });

    // Signal D – Inline script keywords
    const passKeywords = [
      /flexyPassUser/,
      /flexyPassActive/,
      /openFlexyPass/,
      /handleFlexyLogin/,
      /flexy_pass_consent/,
      /flexy_access/,
      /flexyPassNewFlow/,
      /flexyPassStartupHandler/,
      /flexyPassAxentraConfig/
    ];
    inlineScripts.forEach((text, idx) => {
      passKeywords.forEach(kw => {
        if (kw.test(text)) {
          const m = text.match(kw);
          if (m) {
            const start = Math.max(0, m.index - 40);
            const snippet = text.substring(start, start + 120).replace(/\s+/g, ' ').trim();
            passSignals.push({ type: 'inline_script', detail: snippet, keyword: kw.source });
          }
        }
      });
    });

    // Signal E – Shopify app block
    if (/shopify:\/\/apps\/flexypass/i.test(fullHTML)) {
      passSignals.push({ type: 'shopify_app_block', detail: 'FlexyPass app block detected in theme' });
    }

    // Signal F – localStorage keys (can read from page context)
    try {
      if (localStorage.getItem('flexy_pass_consent') !== null) {
        passSignals.push({ type: 'local_storage', detail: 'flexy_pass_consent key exists in localStorage' });
      }
      if (localStorage.getItem('flexy_access') !== null) {
        passSignals.push({ type: 'local_storage', detail: 'flexy_access key exists in localStorage' });
      }
    } catch(_) {}

    const uniquePass = deduplicateSignals(passSignals);
    if (uniquePass.length > 0) {
      result.flexypeProducts.flexypass.detected = true;
      result.flexypeProducts.flexypass.signals  = uniquePass;
      result.flexypeProducts.flexypass.confidence = uniquePass.length >= 3 ? 'high'
                                                   : uniquePass.length >= 1 ? 'medium' : 'low';
    }


    // ═══ 2c. FlexyCart ══════════════════════════════════════════════════

    const cartSignals = [];

    // Signal A – Script URLs
    const cartScriptPats = [
      /flexycart/i,
      /flexy-cart/i,
      /flexype-cart-entry/i,
      /flexype-cart/i
    ];
    allScriptSrcs.forEach(src => {
      cartScriptPats.forEach(p => {
        if (p.test(src)) {
          cartSignals.push({ type: 'script_url', detail: src, pattern: p.source });
        }
      });
    });

    // Signal B – Window globals
    const cartGlobals = [
      'FlexyPeCart', 'flexyCart', 'FlexyCart',
      'fpCart', 'FPCart', 'flexyDrawer', 'FlexyDrawer'
    ];
    cartGlobals.forEach(g => {
      if (typeof window[g] !== 'undefined') {
        cartSignals.push({ type: 'global_variable', detail: 'window.' + g, dataType: typeof window[g] });
      }
    });

    // Signal C – DOM elements
    const cartSelectors = [
      '#flexy-cart-wrapper',
      '#flexycart',
      '.flexycart',
      '#flexy-cart',
      '.flexy-cart',
      '#fp-cart-drawer',
      '.fp-cart-drawer',
      '[data-flexycart]',
      '[data-flexy-cart]'
    ];
    cartSelectors.forEach(sel => {
      try {
        const els = document.querySelectorAll(sel);
        if (els.length > 0) {
          cartSignals.push({ type: 'dom_element', detail: sel, count: els.length });
        }
      } catch(_) {}
    });

    // Signal D – Inline script keywords
    const cartKeywords = [
      /FlexyPeCart/,
      /flexy-cart-wrapper/,
      /flexype-cart-entry/,
      /FlexyPeCart\.cartCountSelector/,
      /FlexyPeCart\.token/,
      /observeForFlexyCart/
    ];
    inlineScripts.forEach((text, idx) => {
      cartKeywords.forEach(kw => {
        if (kw.test(text)) {
          const m = text.match(kw);
          if (m) {
            const start = Math.max(0, m.index - 40);
            const snippet = text.substring(start, start + 120).replace(/\s+/g, ' ').trim();
            cartSignals.push({ type: 'inline_script', detail: snippet, keyword: kw.source });
          }
        }
      });
    });

    // Signal E – Shopify app block
    if (/shopify:\/\/apps\/flexycart/i.test(fullHTML)) {
      cartSignals.push({ type: 'shopify_app_block', detail: 'FlexyCart app block detected in theme' });
    }

    const uniqueCart = deduplicateSignals(cartSignals);
    if (uniqueCart.length > 0) {
      result.flexypeProducts.flexycart.detected = true;
      result.flexypeProducts.flexycart.signals  = uniqueCart;
      result.flexypeProducts.flexycart.confidence = uniqueCart.length >= 3 ? 'high'
                                                    : uniqueCart.length >= 1 ? 'medium' : 'low';
    }


    // ─────────────────────────────────────────────────────────────────────
    //  PART 3 – DISABLED / COMMENTED-OUT INTEGRATIONS
    // ─────────────────────────────────────────────────────────────────────

    const disabled = [];
    const fpRegex = /flexy|flexype|fp-checkout|fp-cart|flexypass|flexycart|FlexyPeCart|FlexyPe/i;

    // 3a – HTML comment blocks
    const commentRe = /<!--([\s\S]*?)-->/g;
    let cm;
    while ((cm = commentRe.exec(fullHTML)) !== null) {
      const body = cm[1];
      // Skip short marker comments like <!-- FlexyPe --> (these are active markers, not disabled)
      if (body.trim().length < 12 && /^\s*FlexyPe\s*$/.test(body.trim())) continue;
      if (fpRegex.test(body)) {
        disabled.push({
          type: 'html_comment',
          description: 'FlexyPe reference found inside an HTML comment block – may be a disabled integration.',
          snippet: ('<!-- ' + body.trim().substring(0, 250) + ' -->'),
          reason: 'Code wrapped in <!-- ... --> comment is inactive.'
        });
      }
    }

    // 3b – Commented-out JS (// or /* */) inside inline <script> tags
    const jsCommentRe = /(?:\/\/[^\n]*(?:flexy|flexype|FlexyPe|FlexyPeCart|flexypass|flexycart|fp-checkout|fp-cart)[^\n]*|\/\*[\s\S]*?(?:flexy|flexype|FlexyPe|FlexyPeCart|flexypass|flexycart|fp-checkout|fp-cart)[\s\S]*?\*\/)/gi;
    inlineScripts.forEach((text, idx) => {
      const re = new RegExp(jsCommentRe.source, 'gi');
      let jcm;
      while ((jcm = re.exec(text)) !== null) {
        disabled.push({
          type: 'commented_js',
          description: 'FlexyPe reference found in commented-out JavaScript.',
          snippet: jcm[0].trim().substring(0, 250),
          reason: 'JavaScript comment (// or /* */) makes this code inactive.'
        });
      }
    });

    // 3c – Non-executable script types
    document.querySelectorAll('script[type="text/template"], script[type="text/plain"]').forEach(s => {
      if (fpRegex.test(s.textContent)) {
        disabled.push({
          type: 'disabled_script',
          description: 'FlexyPe code inside a non-executable <script type="' + s.type + '"> tag.',
          snippet: s.textContent.trim().substring(0, 250),
          reason: 'Script type "' + s.type + '" is not executed by the browser.'
        });
      }
    });

    // 3d – Hidden DOM elements containing FlexyPe identifiers
    const fpElements = document.querySelectorAll(
      '[id*="flexy" i], [id*="flexype" i], [class*="flexy" i], [class*="flexype" i], [data-flexy-pass], [data-flexype], [data-flexy-type]'
    );
    fpElements.forEach(el => {
      try {
        const cs = window.getComputedStyle(el);
        const isHidden = cs.display === 'none'
                      || cs.visibility === 'hidden'
                      || cs.opacity === '0'
                      || el.hasAttribute('hidden');

        if (isHidden) {
          disabled.push({
            type: 'hidden_element',
            description: 'FlexyPe element is hidden via CSS: ' + (el.id ? '#' + el.id : ('.' + el.className)),
            snippet: el.outerHTML.substring(0, 250),
            reason: 'Element is present in DOM but hidden (' + (cs.display === 'none' ? 'display:none'
                    : cs.visibility === 'hidden' ? 'visibility:hidden'
                    : cs.opacity === '0' ? 'opacity:0' : 'hidden attr') + ').'
          });
        }
      } catch(_) {}
    });

    // 3e – Liquid comment traces (rarely rendered, but worth checking)
    const liquidRe = /\{%-?\s*comment\s*-?%\}([\s\S]*?)\{%-?\s*endcomment\s*-?%\}/gi;
    let lm;
    while ((lm = liquidRe.exec(fullHTML)) !== null) {
      if (fpRegex.test(lm[1])) {
        disabled.push({
          type: 'liquid_comment',
          description: 'FlexyPe code inside a Liquid {% comment %} block.',
          snippet: lm[0].substring(0, 250),
          reason: 'Liquid comments prevent code from rendering.'
        });
      }
    }

    result.disabledIntegrations = deduplicateDisabled(disabled);


    // ─────────────────────────────────────────────────────────────────────
    //  THIRD-PARTY APP DETECTION
    // ─────────────────────────────────────────────────────────────────────

    result.thirdPartyApps = detectThirdPartyApps(allScriptSrcs, fullHTML);


    // ─────────────────────────────────────────────────────────────────────
    //  PAGE FEATURES
    // ─────────────────────────────────────────────────────────────────────

    result.pageFeatures = {
      hasCart:             !!document.querySelector('form[action="/cart"], [data-cart], a[href="/cart"]'),
      hasSearch:           !!document.querySelector('input[type="search"], form[action="/search"]'),
      hasWishlist:         !!document.querySelector('[class*="wishlist" i], [id*="wishlist" i]'),
      hasReviews:          !!document.querySelector('[class*="review" i], [id*="review" i], .jdgm-widget'),
      hasCurrencySwitcher: !!document.querySelector('[class*="currency" i], [id*="currency" i]'),
      hasLiveChat:         !!(window.Intercom || window.Freshdesk || window.tidioChatApi ||
                              window.LiveChatWidget || window.$crisp || window.GorgiasChat),
      hasAnalytics:        !!(window.ga || window.gtag || window.fbq || window.dataLayer),
      shopifyPayments:     !!(window.Shopify && window.Shopify.PaymentButton)
    };


    // ─────────────────────────────────────────────────────────────────────
    //  BONUS – PRODUCT CONFIGURATION EXTRACTION
    // ─────────────────────────────────────────────────────────────────────

    const configs = {};

    // Checkout config
    try {
      const checkoutConfig = {};
      // FLEXY_OPTIONS (from Zoura-style inline scripts)
      if (typeof window.FLEXY_OPTIONS !== 'undefined') {
        checkoutConfig.FLEXY_OPTIONS = safeSerialize(window.FLEXY_OPTIONS);
      }
      if (typeof window.flexypeRegion !== 'undefined') {
        checkoutConfig.flexypeRegion = safeSerialize(window.flexypeRegion);
      }
      if (typeof window.flexypeMid !== 'undefined') {
        checkoutConfig.merchantId = window.flexypeMid;
      }
      if (typeof window.flexypeCheckoutReady !== 'undefined') {
        checkoutConfig.checkoutReady = window.flexypeCheckoutReady;
      }
      if (typeof window.flexypeCheckoutFailed !== 'undefined') {
        checkoutConfig.checkoutFailed = window.flexypeCheckoutFailed;
      }
      // Extract config from Shopify.shop and related
      if (window.Shopify && window.Shopify.shop) {
        checkoutConfig.shopDomain = window.Shopify.shop;
      }
      if (Object.keys(checkoutConfig).length > 0) {
        configs.checkout = checkoutConfig;
      }
    } catch(_) {}

    // FlexyPass config
    try {
      const passConfig = {};
      if (typeof window.flexyPassUser !== 'undefined') {
        passConfig.user = safeSerialize(window.flexyPassUser);
      }
      if (typeof window.flexyPassActive !== 'undefined') {
        passConfig.active = window.flexyPassActive;
      }
      if (typeof window.flexyPassConsent !== 'undefined') {
        passConfig.consent = window.flexyPassConsent;
      }
      if (typeof window.flexyPassNewFlow !== 'undefined') {
        passConfig.newFlow = window.flexyPassNewFlow;
      }
      if (typeof window.flexyPassAxentraConfig !== 'undefined') {
        passConfig.axentraConfig = safeSerialize(window.flexyPassAxentraConfig);
      }
      // localStorage values
      try {
        const consent = localStorage.getItem('flexy_pass_consent');
        const access = localStorage.getItem('flexy_access');
        if (consent !== null) passConfig.storedConsent = consent;
        if (access !== null) passConfig.hasAccessToken = true;
      } catch(_) {}
      if (Object.keys(passConfig).length > 0) {
        configs.flexypass = passConfig;
      }
    } catch(_) {}

    // FlexyCart config
    try {
      const cartConfig = {};
      if (typeof window.FlexyPeCart !== 'undefined') {
        cartConfig.FlexyPeCart = safeSerialize(window.FlexyPeCart);
      }
      if (Object.keys(cartConfig).length > 0) {
        configs.flexycart = cartConfig;
      }
    } catch(_) {}

    result.productConfigs = configs;

  } catch (err) {
    result.error      = err.message;
    result.errorStack = err.stack;
  }

  return result;


  // ═════════════════════════════════════════════════════════════════════
  //  HELPER FUNCTIONS
  // ═════════════════════════════════════════════════════════════════════

  function detectCurrentPage() {
    const path = window.location.pathname;
    if (path === '/' || path === '') return 'Home';
    if (/^\/products\/.+/.test(path))     return 'Product';
    if (/^\/collections\/.+/.test(path))  return 'Collection';
    if (path === '/collections')          return 'Collections List';
    if (path === '/cart')                 return 'Cart';
    if (/^\/checkouts?/.test(path))       return 'Checkout';
    if (/^\/pages\/.+/.test(path))        return 'Page';
    if (/^\/blogs?\/.+/.test(path))       return 'Blog';
    if (/^\/account/.test(path))          return 'Account';
    if (/^\/search/.test(path))           return 'Search';
    if (/^\/policies/.test(path))         return 'Policy';
    if (window.Shopify && window.Shopify.analytics && window.Shopify.analytics.page_type) {
      return window.Shopify.analytics.page_type;
    }
    return path;
  }

  function deduplicateSignals(signals) {
    const seen = new Set();
    return signals.filter(s => {
      const key = s.type + '|' + (s.detail || '').substring(0, 80);
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }

  function deduplicateDisabled(items) {
    const seen = new Set();
    return items.filter(item => {
      const key = item.type + '|' + (item.snippet || '').substring(0, 60);
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }

  function safeSerialize(obj, depth) {
    if (depth === undefined) depth = 0;
    if (depth > 3) return '[nested]';
    if (obj === null || obj === undefined) return obj;
    if (typeof obj !== 'object') return obj;
    if (Array.isArray(obj)) return obj.slice(0, 20).map(function(v) { return safeSerialize(v, depth + 1); });
    var result = {};
    var keys = Object.keys(obj).slice(0, 30);
    for (var i = 0; i < keys.length; i++) {
      try { result[keys[i]] = safeSerialize(obj[keys[i]], depth + 1); }
      catch(e) { result[keys[i]] = '[unreadable]'; }
    }
    return result;
  }

  function detectThirdPartyApps(scriptSrcs, html) {
    const apps = [];

    const signatures = [
      { name: 'Klaviyo',              patterns: [/klaviyo/i],                       globals: ['_learnq', 'klaviyo'] },
      { name: 'Yotpo Reviews',        patterns: [/yotpo/i],                         globals: ['yotpo'] },
      { name: 'Hotjar',               patterns: [/hotjar/i],                        globals: ['hj'] },
      { name: 'Intercom',             patterns: [/intercom/i],                      globals: ['Intercom'] },
      { name: 'Facebook Pixel',       patterns: [/fbevents/i, /connect\.facebook/i],globals: ['fbq'] },
      { name: 'Google Analytics',     patterns: [/google-analytics/i, /googletagmanager/i], globals: ['gtag', 'dataLayer'] },
      { name: 'Google Tag Manager',   patterns: [/googletagmanager\.com/i],         globals: ['google_tag_manager'] },
      { name: 'Crisp Chat',           patterns: [/crisp\.chat/i],                   globals: ['$crisp'] },
      { name: 'Tidio',                patterns: [/tidio/i],                         globals: ['tidioChatApi'] },
      { name: 'Gorgias',              patterns: [/gorgias/i],                       globals: ['GorgiasChat'] },
      { name: 'LimeSpot',             patterns: [/limespot/i],                      globals: ['LimeSpot'] },
      { name: 'Recharge Subscriptions',patterns: [/rechargeapps/i],                 globals: ['ReCharge'] },
      { name: 'Bold Commerce',        patterns: [/boldcommerce/i],                  globals: ['BOLD'] },
      { name: 'Judge.me Reviews',     patterns: [/judge\.me/i, /judgeme/i],         globals: ['jdgm'] },
      { name: 'Loox Reviews',         patterns: [/loox/i],                          globals: ['loox'] },
      { name: 'Stamped.io',           patterns: [/stamped\.io/i],                   globals: ['StampedFn'] },
      { name: 'Privy',                patterns: [/privy\.com/i],                    globals: ['Privy'] },
      { name: 'Omnisend',             patterns: [/omnisend/i],                      globals: ['omnisend'] },
      { name: 'Shopify Inbox',        patterns: [/inbox-cdn/i, /shopifyinbox/i],    globals: [] },
      { name: 'Attentive',            patterns: [/attentive/i],                     globals: ['attentive'] },
      { name: 'Lucky Orange',         patterns: [/luckyorange/i],                   globals: ['__lo_cs_added'] },
      { name: 'Microsoft Clarity',    patterns: [/clarity\.ms/i],                   globals: ['clarity'] },
      { name: 'TikTok Pixel',         patterns: [/analytics\.tiktok/i],             globals: ['ttq'] },
      { name: 'Pinterest Tag',        patterns: [/ct\.pinterest/i],                 globals: ['pintrk'] },
      { name: 'Snapchat Pixel',       patterns: [/sc-static\.net/i],                globals: ['snaptr'] },
      { name: 'Wishlist Hero',        patterns: [/wishlist-hero/i],                 globals: [] },
      { name: 'Kaching Bundles',      patterns: [/kaching-bundles/i],               globals: [] },
      { name: 'SEOAnt',               patterns: [/seoant/i, /seowill/i],            globals: [] },
      { name: 'Rebuy',                patterns: [/rebuy/i],                         globals: ['Rebuy'] },
      { name: 'AfterShip',            patterns: [/aftership/i],                     globals: [] },
      { name: 'Smile.io Rewards',     patterns: [/smile\.io/i],                     globals: ['Smile'] }
    ];

    // Also detect from shopify://apps/ comments in HTML
    const appBlockRe = /shopify:\/\/apps\/([a-z0-9_-]+)/gi;
    const appBlockNames = new Set();
    let abm;
    while ((abm = appBlockRe.exec(html)) !== null) {
      appBlockNames.add(abm[1].toLowerCase());
    }

    signatures.forEach(sig => {
      let found = false;
      const foundSignals = [];

      scriptSrcs.forEach(src => {
        sig.patterns.forEach(p => {
          if (p.test(src)) { found = true; foundSignals.push('script: ' + src.substring(0, 100)); }
        });
      });

      sig.globals.forEach(g => {
        if (typeof window[g] !== 'undefined') { found = true; foundSignals.push('global: ' + g); }
      });

      if (found) {
        apps.push({ name: sig.name, signals: foundSignals });
      }
    });

    // Add any Shopify app blocks not already matched
    const matchedLower = new Set(apps.map(a => a.name.toLowerCase().replace(/\s+/g, '-')));
    appBlockNames.forEach(name => {
      // Skip FlexyPe products (detected separately)
      if (/flexy/i.test(name)) return;
      if (!matchedLower.has(name)) {
        apps.push({
          name: name.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase()),
          signals: ['shopify_app_block: shopify://apps/' + name]
        });
      }
    });

    return apps;
  }
}
