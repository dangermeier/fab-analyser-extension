# FaB Analyser Extension

A Chrome extension that turns your [GEM](https://gem.fabtcg.com) profile into a personal analytics dashboard for Flesh and Blood TCG.

![Version](https://img.shields.io/badge/version-1.6.0-gold) ![License](https://img.shields.io/badge/license-MIT-blue) ![Platform](https://img.shields.io/badge/platform-Chrome-green)

---

## Features

**Player Dashboard**

* Win rate breakdown by event type and format
* Hero performance tracking grouped by deck name, with per-hero win rates and match history
* Opponent history with head-to-head records and click-through to individual matches
* ELO and XP trends over time with interactive SVG charts
* Date-range filter across all Trends charts for seasonal analysis
* Full event list with status filter and CSV export

**Judge & Scorekeeper Tools**

* Live tournament view with four exportable canvas layouts: hero breakdown bar chart, hero distribution pie chart, pairings board, and standings table
* Hero card artwork loaded automatically from the card database and cropped to portrait square
* Persistent state across popup open/close — picks up the last open event and view
* One-click Refresh for live events without a full data sync
* PNG export for every canvas view

**Fullscreen Pairings Display** *(new in v1.6)*

* Opens as a dedicated browser tab, designed for projector or monitor display
* Current round pairings in large, high-contrast text
* Auto-refresh every 60 seconds
* Built-in round timer with 55-minute and 35-minute presets and Start / Pause / Reset controls
* Timer turns orange in the last 5 minutes, red and blinking at zero with a "ROUND ENDED" banner
* Auto-scroll when pairings exceed the screen height: slow top-to-bottom loop with pause at each end

**Store Administration** *(new in v1.5)*

* Store tab appears automatically once the extension detects a store linked to your GEM account — no manual setup
* Sync fetches the complete event history (active, upcoming, past)
* Per-event detail view with the same four canvas views and PNG export as the Judge tab
* Attendance trend chart showing player counts per month across all past events
* Most Frequent Players leaderboard ranked by attendance, expandable to show per-player event history
* Blacklist to exclude players (e.g. judges or placeholder accounts) from attendance statistics

---

## Installation

This extension is not on the Chrome Web Store. Install it manually:

1. Download the latest release ZIP from the [Releases](https://github.com/dangermeier/fab-analyser-extension/releases) page
2. Unzip the archive
3. Open `chrome://extensions` in Chrome
4. Enable **Developer mode** (top right toggle)
5. Click **Load unpacked** and select the unzipped folder
6. Navigate to [gem.fabtcg.com](https://gem.fabtcg.com) and click the icon in the bottom-left corner

> **Note:** You need to be logged into GEM before syncing. The extension only reads your own profile data and stores everything locally in your browser.

---

## Usage

**First sync:** Click **Sync Data** in the popup. The extension scrapes your GEM history page by page and stores the result locally. Depending on how many events you have, this takes 10–60 seconds.

**GEM language:** Set your GEM account language to **English** (top-right dropdown on GEM) for best results. Hero names from the coverage CSVs are matched against the card database by name, English names resolve artwork correctly.

**Judge tab:** Only appears if your GEM profile includes judge or scorekeeper events. Click an event to open the live view. Use the 🔄 Refresh button to update pairings and standings without a full sync.

**Store tab:** Appears automatically once the extension detects a store linked to your GEM account. Visit any page on gem.fabtcg.com while logged in and the detection runs in the background. Use the Sync button to load the store's event history, then click any completed event to see hero distribution and pairings, or open the Stats subtab to see attendance data and your regular players.

---

## Data & Privacy

All data is stored locally in your browser via `chrome.storage.local`. Nothing is sent to any external server by this extension. Card artwork is fetched on demand from [goagain.dev](https://api.goagain.dev) and the official FAB card image CDNs.

See [PRIVACY.md](PRIVACY.md) for the full policy.

---

## Development

The extension is built with vanilla JS, no build step required.

```
fab-analyser-extension/
├── manifest.json              # Extension manifest (MV3)
├── background.js              # Service worker: scraping, CSV parsing, image proxy
├── popup.js                   # Dashboard logic, tab rendering, canvas exports
├── popup.html                 # Main popup UI
├── sidepanel.html             # Lightbox/side panel version of the popup
├── content.js                 # Floating button and store detection on gem.fabtcg.com
├── fullscreen-pairings.html   # Standalone fullscreen pairings display
├── fullscreen-pairings.js     # Logic for fullscreen pairings (timer, scroll, fetch)
├── styles.css                 # Entry point, imports themes/base/components
├── themes.css                 # CSS custom properties for all themes
├── base.css                   # Layout and typography
├── components.css             # UI components: tabs, cards, modals, store views
├── dashboard.html             # Redirect shim (unused)
└── icons/                     # Extension icons (16, 48, 128px)
```

To contribute, fork the repo, make your changes and open a pull request. There is no bundler, edit the files directly and reload the unpacked extension in Chrome.

---

## Acknowledgements

Card data and artwork sourced from [goagain.dev](https://api.goagain.dev), a community-maintained Flesh and Blood card database.

Flesh and Blood is a trademark of [Legend Story Studios](https://legendstory.com).

---

## License

MIT see [LICENSE](LICENSE)
