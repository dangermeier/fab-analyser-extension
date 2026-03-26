# Changelog

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
