# FaB Analyser Extension

A Chrome extension that turns your [GEM](https://gem.fabtcg.com) profile into a personal analytics dashboard for Flesh and Blood TCG.

![Version](https://img.shields.io/badge/version-1.4.2-gold) ![License](https://img.shields.io/badge/license-MIT-blue) ![Platform](https://img.shields.io/badge/platform-Chrome-green)

---

## Features

**Player Dashboard**
- Win rate breakdown by event type and format
- Hero performance tracking across all events
- Opponent history with head-to-head records
- ELO and XP trends over time with charts
- Full event list with CSV export

**Judge & Scorekeeper Tools**
- Live tournament view: pairings, standings, hero distribution
- Four exportable visual layouts: bar chart, pie chart, pairings board, standings
- Hero card artwork pulled automatically from the card database
- Persistent state — the extension remembers which event you had open
- One-click refresh for live events without a full sync

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

**GEM language:** Set your GEM account language to **English** (top-right dropdown on GEM) for best results. Hero names from the coverage CSVs are matched against the card database by name — English names resolve artwork correctly.

**Judge tab:** Only appears if your GEM profile includes judge or scorekeeper events. Click an event to open the live view. Use the 🔄 Refresh button to update pairings and standings without a full sync.

---

## Data & Privacy

All data is stored locally in your browser via `chrome.storage.local`. Nothing is sent to any external server by this extension. Card artwork is fetched on demand from [goagain.dev](https://api.goagain.dev) and the official FAB card image CDNs.

See [PRIVACY.md](PRIVACY.md) for the full policy.

---

## Development

The extension is built with vanilla JS, no build step required.

```
fab-analyser-extension/
├── manifest.json       # Extension manifest (MV3)
├── background.js       # Service worker: scraping, CSV parsing, image proxy
├── popup.js            # Dashboard logic, tab rendering, canvas exports
├── popup.html          # Main popup UI
├── sidepanel.html      # Lightbox/side panel version of the popup
├── content.js          # Floating button injected on gem.fabtcg.com
├── dashboard.html      # Redirect shim
└── icons/              # Extension icons (16, 48, 128px)
```

To contribute, fork the repo, make your changes and open a pull request. There is no bundler — edit the files directly and reload the unpacked extension in Chrome.

---

## Acknowledgements

Card data and artwork sourced from [goagain.dev](https://api.goagain.dev) — a community-maintained Flesh and Blood card database.

Flesh and Blood is a trademark of [Legend Story Studios](https://legendstory.com).

---

## License

MIT — see [LICENSE](LICENSE)
