# Changelog

## 1.4.1 — April 2026

### Changed
- Judge Tab: Spielernamen in Pairings und Standings werden aus Datenschutzgründen (DSGVO) nur noch als Initialen angezeigt (z.B. "Alexander Schauer" → "A. S.")
- Judge Tab: Hero-Bilder in der Pairings-Ansicht werden nun zuverlässig per GEM-ID zugeordnet statt per Name-Match

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
