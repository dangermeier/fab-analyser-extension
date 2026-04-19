# Changelog

## 1.6.0 — April 2026

### Added

- **Fullscreen Pairings View**: New `⛶ Pairings Fullscreen` button in Judge and Store event detail views opens a dedicated fullscreen tab (`fullscreen-pairings.html`) showing current pairings for display on a projector or monitor
  - **Round Timer**: 55-minute and 35-minute presets with Start / Pause / Reset controls
  - Timer turns **orange** in the last 5 minutes, **red + blinking** when time is up, and shows a "ROUND ENDED" banner
  - **Auto-refresh** every 60 seconds — pairings update automatically without manual reload
  - **Auto-scroll**: if pairings overflow the screen, the view slowly scrolls from top to bottom and back (50 px/s, 3-second pause at each end)
- **Unknown hero placeholder** (`?`) in Hero Breakdown and Pie Chart: players without a hero assignment are now counted and displayed as `?` instead of being silently excluded

### Changed

- Store tab is now auto-discovered on **any GEM page** — the background fetches `/store/` and scans the current page's DOM for store links, so the tab appears even without visiting a store URL directly
- Store tab visibility is checked immediately on popup open (with one retry via `discoverStores`) — eliminates the need to reload after first store registration
- Fullscreen pairings view shows **player names only** (no hero names) for a cleaner, more readable display

### Fixed

- `parseHeroesCsv`: hero fallback no longer uses the Country/Region column (`DE`) when the hero field is empty — only column 3 is used
- Player event list in Store Stats now shows a helpful message instead of an empty table when data was loaded with an older format that didn't include event arrays
- Hero Breakdown and Pie Chart: `heroCount` now includes players without hero data (counted as `?`) instead of skipping them

---

## 1.5.0 — April 2026

### Added

- **Store Tab**: New 🏪 Store tab for store administrators/scorekeepers
  - Auto-detected when visiting a GEM store page (`/store/{slug}/`) while logged in
  - **Sync Store** button fetches all events from the store (active, upcoming, past) via the store's tournament history pages
  - **Event list** with status filter (All / Active / Upcoming / Past) and click-to-open detail view for non-upcoming events
  - **Tournament detail view** for past and active events: same Hero Breakdown, Pie Chart, Pairings, and Standings canvas views as the Judge tab — including PNG export
  - **Stats tab**: total event count, completed events, total attendances, average players per event
  - **Player Data loader**: batch-fetches heroes CSV for all past events to build a "Most Frequent Players" leaderboard
  - **Blacklist**: block individual players (by GEM ID) from appearing in attendance statistics

---

## 1.4.2 — April 2026

### Changed
- Fixing Judge tab image generation

---

## 1.4.1 — April 2026

### Changed
- Judge Tab: For privacy reasons (GDPR), player names in pairings and standings are now displayed only as initials (e.g., "Alexander Schauer" → "A. S.")
- Judge Tab: Hero images in the pairings view are now reliably assigned by GEM ID instead of by name match

---

## 1.4.0 — April 2026

### Changed
- Sync is now incremental: known closed events are skipped on re-sync, only new and previously active events are re-fetched
- Scraping stops early once a full page contains only already-known closed events and all previously active events are resolved
- Previously active events that closed between syncs but weren't found on scraped pages are fetched individually via `/profile/report/{id}/`

### Fixed
- Floating button icon on gem.fabtcg.com no longer missing — extension icons are now declared in `web_accessible_resources`

---

## 1.3.0 — March 2026

### Added
- Active (in-progress) events are now detected and included in the dashboard
- Each active event is enriched by fetching `/profile/report/{id}/` for matches, hero and meta
- Active events show a ⚡ Live badge in the Events tab and a green row highlight
- Settings tab now shows the correct installed version

### Changed
- CSS split into `themes.css`, `base.css`, `components.css` for better maintainability
- Inline styles removed from `popup.html` and significantly reduced in `popup.js`
- Settings tab replaces the old theme modal — theme selector, version check, data management and links all in one place
- Version check queries the GitHub Releases API and shows an "available" badge when a newer release exists

---

## 1.2.0 — March 2026

### Added
- Judge tab: four exportable visual layouts (hero breakdown bar chart, pie chart, pairings board, standings)
- Hero card artwork in all judge views, loaded via goagain.dev and cached per session
- Artwork-cropped square thumbnails and full-slice pie chart backgrounds
- Live image loading progress bar with per-hero status
- Persistent judge state: the extension remembers the last open event across popup close/reopen
- Refresh button on judge detail view for live events
- Standings loaded from `/coverage/standings` CSV for accurate ordering
- Heroes loaded from `/coverage/heroes` CSV with correct quoted-field parsing

### Changed
- Floating button moved to bottom-left, now shows only the extension icon (no text)
- Judge pie chart: colour tint removed, artwork fills each slice directly
- Breakdown canvas: wider canvas with more padding to prevent text overflow
- Table number parsing: strips non-numeric prefix (e.g. "Table 3" → 3)

### Fixed
- Double `appendChild` bug in lightbox iframe injection
- Base64 image encoding in service worker (binary-safe encoder)
- CORS access for card image CDNs via `host_permissions`
- Canvas `drawImage` source rect for cached thumbnail canvases

---

## 1.1.0 — February 2026

### Added
- Judge/Scorekeeper tab with live tournament pairings and hero breakdown chart
- Side panel support via Chrome Side Panel API
- Floating lightbox button injected on gem.fabtcg.com
- CSV export for events with UTF-8 BOM for Excel compatibility
- Four colour themes: Dark Gold, Parchment, Midnight, Crimson

### Changed
- Hero tracking uses full decklist name (no truncation at comma)
- Opponent sort: Matches / Wins / Losses / Win Rate / Name

---

## 1.0.0 — January 2026

Initial release.

- Overview, Heroes, Opponents, Trends and Events tabs
- GEM profile scraping with page-by-page progress
- Win rate by event type and format
- ELO and XP charts
- Head-to-head opponent modal
- Month detail modal in Trends
