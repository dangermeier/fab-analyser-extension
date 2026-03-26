# Privacy Policy — FaB Analyser Extension

**Last updated:** March 2026

## What data is collected

This extension reads your public tournament history from [gem.fabtcg.com](https://gem.fabtcg.com) while you are logged in. This includes:

- Event names, dates, venues and formats
- Match results, opponents and round data
- Your ELO rating and XP totals from your profile page
- Tournament pairings and standings for events where you are listed as judge or scorekeeper

## Where data is stored

All data is stored exclusively in your browser using `chrome.storage.local`. It never leaves your device through this extension. There is no account, no backend, no analytics.

## External requests

The extension makes requests to the following external services:

- **gem.fabtcg.com** — to read your GEM profile (requires you to be logged in)
- **api.goagain.dev** — to look up card names and retrieve artwork image URLs
- **storage.googleapis.com/fabmaster** — to load card artwork images
- **d2wlb52bya4y8z.cloudfront.net** — to load card artwork images
- **legendstory-production-s3-public.s3.amazonaws.com** — to load card artwork images

These requests are made on demand (when you open the judge view) and only to fetch card artwork. No personal data is included in these requests.

## Clearing your data

Click **Clear Data** in the extension popup to remove all locally stored data immediately.

## Contact

If you have questions, open an issue at [github.com/dangermeier/fab-analyser-extension](https://github.com/dangermeier/fab-analyser-extension).
