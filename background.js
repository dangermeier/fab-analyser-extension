// background.js — Service Worker for FAB Stats Tracker
// Runs in a separate context with no DOM access.
// All HTML parsing uses regex on raw strings.

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === 'fetchTournamentData') {
    // Scrape /gem/{id}/run/ for live pairings/standings
    fetchTournamentData(message.eventId).then(data => {
      sendResponse({ success: true, data });
    }).catch(err => {
      sendResponse({ success: false, error: err.message });
    });
    return true;
  }

  if (message.action === 'fetchStandings') {
    fetchStandingsCsv(message.eventId).then(data => {
      sendResponse({ success: true, data });
    }).catch(err => {
      sendResponse({ success: false, error: err.message });
    });
    return true;
  }

  if (message.action === 'fetchImageAsBase64') {
    function uint8ToBase64(bytes) {
      const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
      let result = '';
      for (let i = 0; i < bytes.length; i += 3) {
        const a = bytes[i], b = bytes[i+1] ?? 0, c = bytes[i+2] ?? 0;
        result += chars[a >> 2]
               + chars[((a & 3) << 4) | (b >> 4)]
               + (i+1 < bytes.length ? chars[((b & 15) << 2) | (c >> 6)] : '=')
               + (i+2 < bytes.length ? chars[c & 63] : '=');
      }
      return result;
    }
    fetch(message.url)
      .then(r => r.arrayBuffer())
      .then(buf => {
        const mime = /\.webp$/i.test(message.url) ? 'image/webp'
                   : /\.png$/i.test(message.url)  ? 'image/png' : 'image/jpeg';
        sendResponse({ success: true, dataUrl: `data:${mime};base64,${uint8ToBase64(new Uint8Array(buf))}` });
      })
      .catch(err => sendResponse({ success: false, error: err.message }));
    return true;
  }

  if (message.action === 'fetchHeroes') {
    // Fetch /gem/{id}/coverage/heroes CSV
    fetchHeroesCsv(message.eventId).then(data => {
      sendResponse({ success: true, data });
    }).catch(err => {
      sendResponse({ success: false, error: err.message });
    });
    return true;
  }

  if (message.action === 'scrapeAllHistory') {
    scrapeAllPages().then(data => {
      sendResponse({ success: true, data });
    }).catch(err => {
      console.error('FAB Tracker scrape error:', err);
      sendResponse({ success: false, error: err.message });
    });
    return true;
  }

  if (message.action === 'getStoredData') {
    chrome.storage.local.get(['fabStats', 'lastScrape'], (result) => {
      sendResponse(result);
    });
    return true;
  }

  if (message.action === 'clearData') {
    chrome.storage.local.clear(() => {
      sendResponse({ success: true });
    });
    return true;
  }
});

// ── MAIN SCRAPER ──────────────────────────────────────────────────────────────

function sendProgress(msg) {
  // Broadcast to all extension pages (popup + side panel)
  chrome.runtime.sendMessage({ action: 'scrapeProgress', text: msg }).catch(() => {});
}

async function scrapeAllPages() {
  const allEvents = [];

  sendProgress('Connecting to GEM…');
  const firstHtml = await fetchPage(1);

  const playerMeta = extractPlayerMeta(firstHtml);
  const maxPage = findMaxPage(firstHtml);

  if (playerMeta.name && playerMeta.name !== 'Unknown') {
    sendProgress(`Logged in as ${playerMeta.name} — ${maxPage} pages found`);
  } else {
    sendProgress(`${maxPage} pages found…`);
  }

  const page1Events = parseEventsFromHtml(firstHtml);
  allEvents.push(...page1Events);
  sendProgress(`Page 1 / ${maxPage} — ${allEvents.length} events loaded`);

  for (let page = 2; page <= maxPage; page++) {
    await sleep(500);
    try {
      const html = await fetchPage(page);
      const events = parseEventsFromHtml(html);
      allEvents.push(...events);
      const pct = Math.round((page / maxPage) * 100);
      sendProgress(`Page ${page} / ${maxPage} (${pct}%) — ${allEvents.length} events so far…`);
    } catch (err) {
      console.error(`FAB Tracker: page ${page} failed:`, err.message);
      sendProgress(`Page ${page} / ${maxPage} — fetch error, skipping…`);
    }
  }

  sendProgress(`All ${maxPage} pages done — loading profile stats…`);

  const profileStats = await scrapeProfileStats();
  sendProgress(`Saving ${allEvents.length} events…`);

  const result = {
    player: playerMeta,
    events: allEvents,
    profileStats,
    lastScrape: Date.now()
  };

  await chrome.storage.local.set({ fabStats: result, lastScrape: Date.now() });

  // Notify all open extension pages that new data is available
  chrome.runtime.sendMessage({ action: 'dataUpdated' }).catch(() => {});

  return result;
}

// ── FETCH ─────────────────────────────────────────────────────────────────────

async function fetchPage(page) {
  // Use /profile/history/ without role filter to get all events
  const url = page === 1
    ? 'https://gem.fabtcg.com/profile/history/'
    : `https://gem.fabtcg.com/profile/history/?page=${page}`;

  const res = await fetch(url, {
    credentials: 'include',
    headers: { 'Accept': 'text/html' }
  });
  if (!res.ok) throw new Error(`HTTP ${res.status} on page ${page}`);
  const text = await res.text();
  return text;
}

async function scrapeProfileStats() {
  try {
    const res = await fetch('https://gem.fabtcg.com/profile/player/', { credentials: 'include' });
    const html = await res.text();
    return parseProfileStats(html);
  } catch (e) {
    return null;
  }
}

// ── PLAYER META ───────────────────────────────────────────────────────────────

function extractPlayerMeta(html) {
  const nameMatch = html.match(/class="account-dropdown__user"[\s\S]*?<span[^>]*>\s*([\w\s\-,äöüÄÖÜß]+?)\s*<br>/);
  const gemIdMatch = html.match(/GEM ID:\s*(\d+)/);
  return {
    name: nameMatch ? nameMatch[1].trim() : 'Unknown',
    gemId: gemIdMatch ? gemIdMatch[1] : ''
  };
}

// ── PAGE COUNT ────────────────────────────────────────────────────────────────

function findMaxPage(html) {
  let max = 1;

  // Method 1: find all ?page=N occurrences
  const allPageNums = [...html.matchAll(/[?&]page=(\d+)/g)];
  allPageNums.forEach(m => {
    const n = parseInt(m[1]);
    if (n > max) max = n;
  });

  // Method 2: look specifically for the >> (last page) link in pagination
  // <a href="?page=16" ...>>>  or  href="?page=16"
  const lastPageMatch = html.match(/pagination-arrow-next[\s\S]{0,200}?[?&]page=(\d+)/);
  if (lastPageMatch) {
    const n = parseInt(lastPageMatch[1]);
    if (n > max) max = n;
  }

  // Method 3: find the active page marker to sanity-check
  const activeMatch = html.match(/page-item active[^>]*>[\s\S]*?(\d+)[\s\S]*?<\/li>/);
  const activePage = activeMatch ? parseInt(activeMatch[1]) : 1;

  return max;
}

// ── EVENT PARSING ─────────────────────────────────────────────────────────────

function parseEventsFromHtml(html) {
  const events = [];

  // Split on individual event divs
  const parts = html.split(/<div class="event" id="/);

  for (let i = 1; i < parts.length; i++) {
    const block = parts[i];

    const idMatch = block.match(/^(\d+)"/);
    if (!idMatch) continue;
    const eventId = idMatch[1];

    // Title: grab h4 content, strip tags
    let title = 'Unknown';
    const h4Match = block.match(/<h4[^>]*class="event__title"[^>]*>([\s\S]*?)<\/h4>/);
    if (h4Match) title = stripTags(h4Match[1]).replace(/\s+/g, ' ').trim();

    // Card date badge
    const dateBadge = block.match(/class="event__when[^"]*"[^>]*>\s*([\w.,\s]+?)\s*<\/div>/);
    const dateText = dateBadge ? dateBadge[1].trim() : '';

    // Meta spans
    const metaBlock = block.match(/class="event__meta">([\s\S]*?)(?:<div class="btn-group"|<details\s)/);
    let metaSpans = [];
    if (metaBlock) {
      const spanRe = /<span>([\s\S]*?)<\/span>/g;
      let sm;
      while ((sm = spanRe.exec(metaBlock[1])) !== null) {
        const t = stripTags(sm[1]).trim();
        if (t) metaSpans.push(t);
      }
    }
    const eventMeta = parseMetaItems(metaSpans);

    // Details section
    const detailsMatch = block.match(/<details class="event__extra-details"([\s\S]*?)<\/details>/);
    let totalWins = 0, xpGained = 0, netRatingChange = null;
    let matches = [];
    let hero = null;

    if (detailsMatch) {
      const det = detailsMatch[1];

      const wM = det.match(/Total Wins[\s\S]*?<td>(\d+)<\/td>/);
      if (wM) totalWins = parseInt(wM[1]);

      const xM = det.match(/XP Gained[\s\S]*?<td>(\d+)<\/td>/);
      if (xM) xpGained = parseInt(xM[1]);

      const rM = det.match(/Net Rating Change[\s\S]*?<td>([^<]+)<\/td>/);
      if (rM) netRatingChange = rM[1].trim();

      // Match rows
      const matchSection = det.match(/Matches<\/h5>([\s\S]*?)(?:<h5|$)/);
      if (matchSection) {
        const rowRe = /<tr>([\s\S]*?)<\/tr>/g;
        let rowIdx = 0, rm;
        while ((rm = rowRe.exec(matchSection[1])) !== null) {
          if (rowIdx++ === 0) continue; // header row
          const cells = [...rm[1].matchAll(/<td>([\s\S]*?)<\/td>/g)];
          if (cells.length < 3) continue;

          const round = stripTags(cells[0][1]).trim();
          const oppRaw = stripTags(cells[1][1]).trim();
          const result = stripTags(cells[2][1]).trim();
          const record = cells[3] ? stripTags(cells[3][1]).trim() : '';
          const ratingChange = cells[4] ? stripTags(cells[4][1]).trim() : null;

          const oppM = oppRaw.match(/^(.+?)\s*\((\d+)\)\s*$/);
          matches.push({
            round,
            opponentName: oppM ? oppM[1].trim() : oppRaw,
            opponentGemId: oppM ? oppM[2] : '',
            result,
            record,
            ratingChange
          });
        }
      }

      // Hero from decklists
      const deckSection = det.match(/Decklists<\/h5>([\s\S]*?)(?:<h5|<\/details|$)/);
      if (deckSection) {
        const deckLink = deckSection[1].match(/<a[^>]*>([\s\S]*?)<\/a>/);
        if (deckLink) {
          const deckText = stripTags(deckLink[1]).trim();
          // Keep the FULL deck name as the hero key so we don't conflate
          // "Valda, Seismic Impact" with "Valda Brightaxe" etc.
          // The deck name format is "HeroName, DeckTitle" or just "HeroName"
          // We display the full string but group by it exactly.
          hero = deckText;
        }
      }
    }

    events.push({
      id: eventId,
      title,
      dateText,
      ...eventMeta,
      totalWins,
      xpGained,
      netRatingChange,
      matches,
      hero,
      role: block.includes('event__judge-icon') ? 'judge'
          : block.includes('Scorekeeper') ? 'scorekeeper'
          : 'player',
      runUrl: (() => {
        const m = block.match(/href="(\/gem\/\d+\/run\/)"/);
        return m ? m[1] : null;
      })()
    });
  }

  return events;
}

// ── PROFILE STATS ─────────────────────────────────────────────────────────────

function parseProfileStats(html) {
  const stats = {};

  const xp90 = html.match(/90 Day XP:[\s\S]*?<strong>([\d.]+)<\/strong>/);
  if (xp90) stats.xp90Day = xp90[1];

  const xpLife = html.match(/Lifetime XP:[\s\S]*?<strong>([\d.]+)<\/strong>/);
  if (xpLife) stats.xpLifetime = xpLife[1];

  const elo = html.match(/Elo Rating[\s\S]*?<strong>([\d.]+)<\/strong>/);
  if (elo) stats.elo = elo[1];

  const evTotalM = html.match(/Events:[\s\S]{0,200}?<strong>(\d+)<\/strong>[\s\S]{0,50}?<strong>(\d+)<\/strong>/);
  if (evTotalM) { stats.eventsTotal = evTotalM[1]; stats.eventsRated = evTotalM[2]; }

  const winTotalM = html.match(/Wins:[\s\S]{0,200}?<strong>(\d+)<\/strong>[\s\S]{0,50}?<strong>(\d+)<\/strong>/);
  if (winTotalM) { stats.winsTotal = winTotalM[1]; stats.winsRated = winTotalM[2]; }

  // ELO global rank — look for the global rank SVG followed by a number
  const rankBlocks = [...html.matchAll(/data-original-title="([^"]*)"[\s\S]{0,400}?<\/svg>\s*(\d+)/g)];
  rankBlocks.forEach(m => {
    const title = m[1];
    const val = m[2];
    if (title.includes('Global') && title.includes('90')) stats.rank90DayGlobal = val;
    if (title.includes('Country') && title.includes('90')) stats.rank90DayCountry = val;
    if (title.includes('Global') && title.includes('Lifetime')) stats.rankLifetimeGlobal = val;
    if (title.includes('Country') && title.includes('Lifetime')) stats.rankLifetimeCountry = val;
    if (title.includes('Global') && (title.includes('Elo') || title.includes('Rating'))) stats.rankEloGlobal = val;
    if (title.includes('Country') && (title.includes('Elo') || title.includes('Rating'))) stats.rankEloCountry = val;
  });

  return stats;
}

// ── META PARSER ───────────────────────────────────────────────────────────────

function parseMetaItems(texts) {
  const result = {
    venue: null,
    eventType: null,
    format: null,
    xpModifier: null,
    isRated: false,
    dateTime: null
  };

  const monthRe = /January|February|March|April|May|June|July|August|September|October|November|December/;
  const formats = ['Classic Constructed', 'Silver Age', 'Sealed Deck', 'Blitz', 'Draft'];
  const eventTypes = ['Armory Event', 'Social Play Event', 'On Demand', 'Pre-Release', 'Road to Nationals', 'Pro Quest', 'Skirmish', 'Battle Hardened'];

  const used = new Set();

  texts.forEach((text, i) => {
    if (!text) return;

    if (monthRe.test(text) || /\d{4},\s*\d+:\d+/.test(text)) {
      result.dateTime = text; used.add(i); return;
    }
    if (text.startsWith('XP Modifier:')) {
      result.xpModifier = parseInt(text.replace('XP Modifier:', '').trim()) || 0;
      used.add(i); return;
    }
    if (text === 'Rated') { result.isRated = true; used.add(i); return; }
    if (text === 'Not rated') { result.isRated = false; used.add(i); return; }
    if (formats.some(f => text.includes(f))) {
      result.format = text; used.add(i); return;
    }
    if (eventTypes.some(t => text.includes(t))) {
      result.eventType = text; used.add(i); return;
    }
  });

  // Venue = first unused text that isn't a number or modifier
  texts.forEach((text, i) => {
    if (!result.venue && !used.has(i) && text && text.length > 2 && !/^\d+$/.test(text)) {
      result.venue = text;
    }
  });

  return result;
}

// ── UTILS ─────────────────────────────────────────────────────────────────────

function stripTags(html) {
  return html
    .replace(/<[^>]+>/g, '')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&nbsp;/g, ' ')
    .replace(/&#\d+;/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// ── TOURNAMENT DATA (Judge/Scorekeeper) ───────────────────────────────────────

async function fetchTournamentData(eventId) {
  const url = `https://gem.fabtcg.com/gem/${eventId}/run/`;
  const res = await fetch(url, { credentials: 'include', headers: { 'Accept': 'text/html' } });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const html = await res.text();
  return parseTournamentHtml(html, eventId);
}

function parseTournamentHtml(html, eventId) {
  const result = { eventId, rounds: [], players: [], meta: {} };

  // Meta: event title
  const titleM = html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/);
  if (titleM) result.meta.title = stripTags(titleM[1]).trim();

  // Meta: from info table
  const statusM = html.match(/Status[\s\S]*?<td>([\s\S]*?)<\/td>/);
  if (statusM) result.meta.status = stripTags(statusM[1]).trim();

  const typeM = html.match(/(?:Typ|Type)[\s\S]*?<td>([\s\S]*?)<\/td>/);
  if (typeM) result.meta.type = stripTags(typeM[1]).trim();

  const formatM = html.match(/Format[\s\S]*?<td>([\s\S]*?)<\/td>/);
  if (formatM) result.meta.format = stripTags(formatM[1]).trim();

  const roundsM = html.match(/(?:Runden|Rounds)[\s\S]*?<td>([\s\S]*?)<\/td>/);
  if (roundsM) result.meta.totalRounds = parseInt(stripTags(roundsM[1]).trim()) || null;

  const playersM = html.match(/(\d+)\s+(?:registrierte Spieler|registered player)/);
  if (playersM) result.meta.playerCount = parseInt(playersM[1]);

  // Players list
  const playerListM = html.match(/(?:Registrierte Spieler|Registered Players?)[\s\S]*?<ol[^>]*>([\s\S]*?)<\/ol>/);
  if (playerListM) {
    const liRe = /<li[^>]*>([\s\S]*?)<\/li>/g;
    let lm;
    while ((lm = liRe.exec(playerListM[1])) !== null) {
      const row = stripTags(lm[1]).replace(/\s+/g, ' ').trim();
      // format: "LastName, FirstName (GEMID)  HeroName"
      const playerM = row.match(/^(.+?)\s*\((\d+)\)\s*(.*)/);
      if (playerM) {
        result.players.push({
          name: playerM[1].trim(),
          gemId: playerM[2],
          hero: playerM[3].trim() || null
        });
      }
    }
  }

  // Rounds — find all "Runde N (Swiss)" / "Round N" blocks
  const roundBlocks = html.split(/(?=<div class="content-card">[\s\S]*?<div class="swiss">)/);
  roundBlocks.forEach(block => {
    if (!block.includes('swiss')) return;

    const roundNumM = block.match(/(?:Runde|Round)\s+(\d+)/);
    if (!roundNumM) return;
    const roundNum = parseInt(roundNumM[1]);

    // Stats
    const liveM = block.match(/Live[\s\S]*?<td><span>(\d+)<\/span>/);
    const doneM = block.match(/(?:Fertig|Finished)[\s\S]*?<td><span>(\d+)<\/span>/);
    const totalM = block.match(/(?:Gesamt|Total)[\s\S]*?<td><span>(\d+)<\/span>/);

    const pairings = [];
    // Each match row
    const matchRowRe = /match-row([\s\S]*?)(?=match-row|btn-group|$)/g;
    let mr;
    while ((mr = matchRowRe.exec(block)) !== null) {
      const cells = [...mr[1].matchAll(/<div[^>]*col-[^>]*py-3[^>]*>([\s\S]*?)<\/div>/g)];
      if (cells.length < 4) continue;
      const table = cells[0] ? stripTags(cells[0][1]).trim() : '';
      const p1raw = cells[1] ? stripTags(cells[1][1]).trim() : '';
      const p2raw = cells[2] ? stripTags(cells[2][1]).trim() : '';
      const resultRaw = cells[3] ? stripTags(cells[3][1]).trim() : '';
      if (!p1raw || !p2raw) continue;

      const p1M = p1raw.match(/^(.+?)\s*\((\d+)\)$/);
      const p2M = p2raw.match(/^(.+?)\s*\((\d+)\)$/);

      // Determine winner from CSS class "win" on the div
      const p1Win = mr[1].includes('col-sm-4 py-3 win') &&
        mr[1].indexOf('col-sm-4 py-3 win') < mr[1].lastIndexOf(p2raw);
      const p2Win = resultRaw.toLowerCase().includes('player 2') ||
        resultRaw.toLowerCase().includes('spieler 2');

      pairings.push({
        table: parseInt(table.replace(/[^0-9]/g, '')) || table,
        p1: p1M ? p1M[1].trim() : p1raw,
        p1GemId: p1M ? p1M[2] : '',
        p2: p2M ? p2M[1].trim() : p2raw,
        p2GemId: p2M ? p2M[2] : '',
        result: resultRaw,
        winner: p2Win ? 'p2' : (resultRaw.toLowerCase().includes('player 1') || resultRaw.toLowerCase().includes('spieler 1')) ? 'p1' : null,
        done: !!resultRaw && !resultRaw.toLowerCase().includes('live')
      });
    }

    if (pairings.length > 0) {
      result.rounds.push({
        round: roundNum,
        live: liveM ? parseInt(liveM[1]) : 0,
        done: doneM ? parseInt(doneM[1]) : 0,
        total: totalM ? parseInt(totalM[1]) : pairings.length,
        pairings
      });
    }
  });

  // Sort rounds descending (most recent first is how GEM shows them, but we want ascending)
  result.rounds.sort((a, b) => a.round - b.round);
  result.currentRound = result.rounds.length > 0 ? result.rounds[result.rounds.length - 1].round : 0;

  return result;
}

async function fetchStandingsCsv(eventId) {
  // Try latest round first, fall back to base URL
  const url = `https://gem.fabtcg.com/gem/${eventId}/coverage/standings`;
  const res = await fetch(url, { credentials: 'include' });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const text = await res.text();
  return parseStandingsCsv(text);
}

function parseStandingsCsv(csv) {
  const lines = csv.trim().split(/\r?\n/);
  const standings = [];

  // Format: Rank,Name,Player ID,Wins
  for (let i = 1; i < lines.length; i++) {
    if (!lines[i].trim()) continue;
    const parts = lines[i].split(',');
    if (parts.length < 3) continue;
    standings.push({
      rank:   parseInt(parts[0]) || i,
      name:   parts[1].trim(),
      gemId:  parts[2].trim(),
      wins:   parseInt(parts[3]) || 0,
      losses: 0, // not in CSV, calculated below if needed
      points: 0,
    });
  }

  // Infer losses from round count: total rounds - wins - draws (not tracked)
  // We skip this as it's not reliable without round data
  return standings.sort((a, b) => a.rank - b.rank);
}

async function fetchHeroesCsv(eventId) {
  const url = `https://gem.fabtcg.com/gem/${eventId}/coverage/heroes`;
  const res = await fetch(url, { credentials: 'include' });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const text = await res.text();
  return parseHeroesCsv(text);
}

function parseHeroesCsv(csv) {
  const lines = csv.trim().split(/\r?\n/);
  const heroes = [];

  // Parse a CSV line respecting quoted fields (hero names contain commas)
  function parseLine(line) {
    const fields = [];
    let cur = '', inQuote = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === '"') { inQuote = !inQuote; continue; }
      if (ch === ',' && !inQuote) { fields.push(cur); cur = ''; continue; }
      cur += ch;
    }
    fields.push(cur);
    return fields;
  }

  // Skip header line
  for (let i = 1; i < lines.length; i++) {
    if (!lines[i].trim()) continue;
    const parts = parseLine(lines[i]);
    // Columns: Spielername, Spieler-ID, Country/Region, Held
    const name  = (parts[0] || '').trim();
    const gemId = (parts[1] || '').trim();
    const hero  = (parts[3] || parts[2] || '').trim(); // Held is col 3, fallback col 2
    if (name) heroes.push({ name, gemId, hero });
  }
  return heroes;
}
