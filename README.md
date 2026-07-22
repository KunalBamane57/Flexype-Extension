# FlexyPe Shopify Store Diagnostics – Chrome Extension

> An internal Chrome Extension that automates Shopify store inspection for FlexyPe's Sales and Support teams. Open it on any Shopify storefront to instantly understand the store's current setup.

![Chrome Extension](https://img.shields.io/badge/Chrome-Extension-4285F4?style=flat&logo=googlechrome&logoColor=white)
![Manifest V3](https://img.shields.io/badge/Manifest-V3-green?style=flat)
![No Backend](https://img.shields.io/badge/Backend-None%20Required-blue?style=flat)

---

## Table of Contents

- [Overview](#overview)
- [Features](#features)
- [Setup Instructions](#setup-instructions)
- [How to Use](#how-to-use)
- [Detection Approach](#detection-approach)
- [Project Structure](#project-structure)
- [Technical Details](#technical-details)

---

## Overview

At FlexyPe, Sales and Support teams regularly inspect Shopify stores before onboarding merchants. This process involves identifying existing FlexyPe products, checking for previous integrations, understanding the merchant's theme, detecting third-party applications, and identifying potential integration issues.

This Chrome Extension automates these checks and presents all relevant diagnostics directly inside the extension popup — **no backend required**.

---

## Features

### Part 1 – Store Information
- **Store URL, Shop Name, Base Currency, Country, Locale**
- **Shopify Domain** (myshopify.com domain)
- **Theme Name** (e.g., Dawn, Impulse, Debut)
- **Current Page Type** (Home, Product, Collection, Cart, Checkout, etc.)
- **CDN Host** and other metadata from `window.Shopify`

### Part 2 – FlexyPe Product Detection
Detects three FlexyPe products using **multiple signals** (not hardcoded selectors):

| Product | Key Signals |
|---------|-------------|
| **FlexyPe Checkout** | `static.flexype.in/scripts/flexype-v2.min.js`, `window.openFlexyCheckout`, `.flexy-btn` elements, `grade.flexype.net` API calls |
| **FlexyPass** | `pass.min.js` from Shopify CDN, `window.flexyPassUser`, `#flexy-pass-wrapper`, `data-flexy-pass` attributes, localStorage keys |
| **FlexyCart** | `flexype-cart-entry.min.js` from Shopify CDN, `window.FlexyPeCart`, `#flexy-cart-wrapper`, Shopify app block comments |

Each product shows a **confidence level** (High/Medium) based on the number of signals found.

### Part 3 – Disabled Integration Detection
Detects FlexyPe integrations that exist but are currently inactive:
- **HTML comment blocks** containing FlexyPe references
- **Commented-out JavaScript** (`//` or `/* */` blocks)
- **Non-executable script tags** (`<script type="text/template">`)
- **Hidden DOM elements** (display:none, visibility:hidden, opacity:0)
- **Liquid comment blocks** (`{% comment %}...{% endcomment %}`)

Each disabled integration includes an **explanation** of why it's considered disabled.

### Additional Features
- **Third-party app detection** (30+ apps: Klaviyo, Judge.me, Omnisend, etc.)
- **Page feature detection** (Cart, Search, Wishlist, Reviews, Live Chat, Analytics)
- **Copy-to-clipboard** text report for sharing with the team
- **Premium dark UI** with tabbed interface, gradient accents, and micro-animations

---

## Setup Instructions

### 1. Clone the Repository
```bash
git clone https://github.com/YOUR_USERNAME/flexype-store-diagnostics.git
cd flexype-store-diagnostics
```

### 2. Generate Icons (Optional)
```bash
node generate_icons.js
```
This creates PNG icons from the built-in generator. You can also manually convert `icons/icon.svg` using any image editor.

### 3. Load in Chrome
1. Open Chrome and navigate to `chrome://extensions/`
2. Enable **Developer Mode** (toggle in top-right)
3. Click **"Load unpacked"**
4. Select the project folder (the one containing `manifest.json`)
5. The FlexyPe Diagnostics icon should appear in your browser toolbar

### 4. Pin the Extension
- Click the puzzle piece icon in Chrome's toolbar
- Find **"FlexyPe Store Diagnostics"** and click the pin icon

---

## How to Use

1. Navigate to any Shopify storefront (e.g., `https://zouraofficial.com/`)
2. Click the FlexyPe Diagnostics extension icon in your toolbar
3. The extension automatically scans the page and displays results in 4 tabs:
   - **Overview** – Store info, product status summary, page features
   - **Products** – Detailed FlexyPe product detection with all signals
   - **Disabled** – Any commented-out or hidden FlexyPe integrations
   - **Apps** – Third-party Shopify apps detected on the store
4. Click **"Copy Report"** to copy a text summary to your clipboard for sharing

### Testing
- Visit `https://www.aseemshakti.com/` → Should detect **FlexyPe Checkout** only
- Visit `https://zouraofficial.com/` → Should detect **all three products** (Checkout, FlexyPass, FlexyCart)
- Visit any non-Shopify site → Should show "Not a Shopify Store"

---

## Detection Approach

### Multi-Signal Strategy

The extension does **not** rely on a single hardcoded selector. Instead, it uses a layered detection approach with **8 different signal types**:

| Signal Type | Description | Example |
|-------------|-------------|---------|
| **Script URL** | External JS files loaded from FlexyPe domains | `static.flexype.in/scripts/flexype-v2.min.js` |
| **Global Variable** | Window-level JS objects set by FlexyPe scripts | `window.openFlexyCheckout`, `window.FlexyPeCart` |
| **DOM Element** | HTML elements with FlexyPe-specific IDs, classes, or attributes | `.flexy-btn`, `#flexy-cart-wrapper`, `[data-flexy-pass]` |
| **Inline Script** | Keyword matches inside `<script>` tag contents | References to `flexypeCheckoutReady`, `FlexyPeCart.token` |
| **Shopify App Block** | Theme HTML comments indicating installed app blocks | `shopify://apps/flexycart/blocks/app-embed/...` |
| **API Endpoint** | Fetch/XHR calls to FlexyPe API domains | `grade.flexype.net/api/v1/metric` |
| **localStorage** | Client-side storage keys set by FlexyPe products | `flexy_pass_consent`, `flexy_access` |
| **HTML Markers** | Comment markers injected by FlexyPe theme code | `<!-- FlexyPe -->` |

### Confidence Scoring
- **High** – 3+ signals detected (very likely installed)
- **Medium** – 1-2 signals detected (probably installed)
- **Not Detected** – 0 signals

### How Signals Were Identified
Signals were derived by **inspecting real Shopify stores** with known FlexyPe integrations:
- `aseemshakti.com` – FlexyPe Checkout only
- `zouraofficial.com` – All three products (Checkout, FlexyPass, FlexyCart)

The page source, DOM structure, script tags, global variables, and Shopify app block comments were analyzed to extract reliable, non-hardcoded detection patterns.

---

## Project Structure

```
flexype-store-diagnostics/
├── manifest.json              # Chrome Extension manifest (v3)
├── background/
│   └── background.js          # Service worker: handles messaging & MAIN world injection
├── content/
│   └── content.js             # Content script: bridge between page & extension
├── popup/
│   ├── popup.html             # Extension popup UI structure
│   ├── popup.css              # Premium dark theme styling
│   └── popup.js               # Popup controller: renders diagnostics data
├── icons/
│   ├── icon.svg               # Source SVG icon
│   ├── icon16.png             # 16×16 toolbar icon
│   ├── icon48.png             # 48×48 management page icon
│   └── icon128.png            # 128×128 Chrome Web Store icon
├── generate_icons.js          # Icon generator script (Node.js)
└── README.md                  # This file
```

---

## Technical Details

### Architecture
- **Manifest V3** – Latest Chrome Extension standard
- **Service Worker** (`background.js`) – Handles message routing and injects the diagnostic function into the page using `chrome.scripting.executeScript()` with `world: 'MAIN'`
- **MAIN World Injection** – The diagnostic function runs in the page's JavaScript context, giving it access to `window.Shopify`, `window.FlexyPeCart`, `window.flexyPassUser`, etc.
- **Content Script** (`content.js`) – Lightweight bridge for future extensibility
- **Popup** – Receives data from background, renders the tabbed UI

### Browser APIs Used
- `chrome.scripting.executeScript` – Inject diagnostics into the page context
- `chrome.tabs.query` – Get active tab information
- `chrome.runtime.sendMessage` / `onMessage` – Extension messaging
- `navigator.clipboard.writeText` – Copy report to clipboard

### Why MAIN World?
FlexyPe products set global variables (e.g., `window.FlexyPeCart`, `window.openFlexyCheckout`) that are only accessible in the page's main JavaScript context, not in the isolated content script world. Using `world: 'MAIN'` in `chrome.scripting.executeScript()` allows the extension to read these globals directly.

---

## Permissions

| Permission | Reason |
|------------|--------|
| `activeTab` | Access the current tab to run diagnostics |
| `scripting` | Inject diagnostic script into the page's MAIN world |
| `tabs` | Query active tab URL and title |
| `<all_urls>` | Run on any Shopify storefront (unknown domains) |

---

## Limitations

- **Static HTML only** – The extension reads the DOM at the time of scanning. Dynamically loaded elements (e.g., lazy-loaded widgets) may not be detected if they haven't rendered yet.
- **No backend** – Configuration fetching (Bonus task) would require API access; the current implementation is fully client-side.
- **Commented Liquid** – Liquid `{% comment %}` blocks are processed server-side and don't appear in rendered HTML. The extension can only detect them if they're somehow present in the output.

---

## Author

Built as a Product Support Engineer Assignment for FlexyPe by Kunal Ashok Bamane 😁.
