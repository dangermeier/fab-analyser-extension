// popup.js — FAB Stats Tracker
// Dashboard logic: tab rendering, data display, judge tools, canvas exports.

let currentData = null;
let activeTab = 'overview';
let opponentFilter = 'all';
let eventTypeFilter = 'all';
let judgeState = null; // persists active judge event across tab switches and popup close/reopen

// ── INIT ──────────────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  applyStoredTheme();
  setupTabs();
  setupButtons();
  setupModals();
  setupProgressListener();
  loadStoredData();
});

// ── PROGRESS LISTENER ────────────────────────────────────────────────────────
function setupProgressListener() {
  chrome.runtime.onMessage.addListener((message) => {
    if (message.action === 'scrapeProgress') {
      updateProgress(message.text);
    }
    // Auto-refresh when background finishes a sync (e.g. triggered from side panel on another tab)
    if (message.action === 'dataUpdated') {
      loadStoredData();
    }
  });
}

function updateProgress(text) {
  const textEl = document.getElementById('loading-text');
  const barEl  = document.getElementById('progress-bar');
  const labelEl = document.getElementById('progress-label');
  if (!textEl) return;

  textEl.textContent = text;

  // Parse "Page X / Y" to get percentage
  const pageMatch = text.match(/Page\s+(\d+)\s*\/\s*(\d+)/);
  if (pageMatch && barEl && labelEl) {
    const cur = parseInt(pageMatch[1]);
    const max = parseInt(pageMatch[2]);
    const pct = Math.round((cur / max) * 100);
    barEl.style.width = pct + '%';
    labelEl.textContent = `${pct}% · ${cur} of ${max} pages`;
  } else if (barEl) {
    // Indeterminate phases
    if (text.includes('Connecting') || text.includes('found')) {
      barEl.style.width = '5%';
      if (labelEl) labelEl.textContent = 'Connecting…';
    } else if (text.includes('profile')) {
      barEl.style.width = '97%';
      if (labelEl) labelEl.textContent = 'Almost done…';
    } else if (text.includes('Saving')) {
      barEl.style.width = '99%';
      if (labelEl) labelEl.textContent = 'Saving…';
    }
  }
}

// ── THEME ─────────────────────────────────────────────────────────────────────
function applyStoredTheme() {
  const t = localStorage.getItem('fabTheme') || 'dark';
  document.body.setAttribute('data-theme', t);
  highlightActiveThemeBtn(t);
}

function highlightActiveThemeBtn(theme) {
  document.querySelectorAll('.theme-btn').forEach(b => {
    b.classList.toggle('active', b.dataset.theme === theme);
  });
}

// ── TABS ──────────────────────────────────────────────────────────────────────
function setupTabs() {
  document.querySelectorAll('.tab').forEach(tab => {
    tab.addEventListener('click', () => {
      document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      activeTab = tab.dataset.tab;
      if (currentData) showTab(activeTab);
    });
  });
}

function showTab(tab) {
  document.querySelectorAll('.pane').forEach(p => p.classList.remove('active'));
  const pane = document.getElementById(`pane-${tab}`);
  if (pane) {
    pane.classList.add('active');
    // Settings tab works even without data loaded
    if (tab === 'settings' || currentData) renderTab(tab);
  }
}

// ── BUTTONS ───────────────────────────────────────────────────────────────────
function setupButtons() {
  document.getElementById('btn-scrape').addEventListener('click', startScrape);
  document.getElementById('btn-export').addEventListener('click', exportToCSV);

  // Clear data (now lives in Settings tab)
  document.getElementById('btn-clear').addEventListener('click', () => {
    if (!confirm('Clear all stored data?')) return;
    chrome.runtime.sendMessage({ action: 'clearData' }, () => {
      currentData = null;
      judgeState = null;
      chrome.storage.local.remove('judgeStateRef');
      showEmpty();
    });
  });

  // Trend date range — registered once here to prevent stacking on repeated showDashboard calls
  document.getElementById('trend-from').addEventListener('change', () => { if (currentData) renderTab('trends'); });
  document.getElementById('trend-to').addEventListener('change',   () => { if (currentData) renderTab('trends'); });
  document.getElementById('trend-reset').addEventListener('click', () => {
    if (!currentData?.events) return;
    const dates = currentData.events
      .map(e => parseEventDate(e.dateTime || e.dateText))
      .filter(Boolean).sort((a, b) => a - b);
    if (dates.length) {
      document.getElementById('trend-from').value = toDateInput(dates[0]);
      document.getElementById('trend-to').value   = toDateInput(dates[dates.length - 1]);
    }
    renderTab('trends');
  });
}

// ── SETTINGS TAB ─────────────────────────────────────────────────────────────

const CURRENT_VERSION = '1.4.1';
const GITHUB_RELEASE_API = 'https://api.github.com/repos/dangermeier/fab-analyser-extension/releases/latest';

function renderSettings() {
  // Show installed version
  const vEl = document.getElementById('settings-version');
  if (vEl) vEl.textContent = CURRENT_VERSION;

  // Check for updates via GitHub releases API
  checkForUpdate();
}

async function checkForUpdate() {
  const el = document.getElementById('update-status');
  if (!el) return;

  try {
    const res = await fetch(GITHUB_RELEASE_API);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    const latest = data.tag_name?.replace(/^v/, '') || '';

    if (!latest) throw new Error('No release found');

    if (latest === CURRENT_VERSION) {
      el.className = 'update-badge update-badge--current';
      el.innerHTML = `✓ Up to date`;
    } else {
      el.className = 'update-badge update-badge--available';
      el.innerHTML = `v${latest} available ↗`;
      el.style.cursor = 'pointer';
      el.onclick = () => { window.open(data.html_url, '_blank'); };
    }
  } catch {
    el.className = 'update-badge update-badge--error';
    el.textContent = 'Could not check';
  }
}

// ── MODALS ────────────────────────────────────────────────────────────────────
const ALL_MODALS = ['modal-overlay', 'hero-modal-overlay', 'month-modal-overlay'];

function openModal(id) {
  document.getElementById(id).classList.remove('hidden');
  document.body.style.overflow = 'hidden';
}

function closeModal(id) {
  document.getElementById(id).classList.add('hidden');
  if (ALL_MODALS.every(m => document.getElementById(m)?.classList.contains('hidden'))) {
    document.body.style.overflow = '';
  }
}

function setupModals() {
  ALL_MODALS.forEach(id => {
    const el = document.getElementById(id);
    if (!el) return;
    el.addEventListener('click', e => {
      if (e.target === e.currentTarget) closeModal(id);
    });
  });

  ['modal-close', 'hero-modal-close', 'month-modal-close'].forEach(btnId => {
    const btn = document.getElementById(btnId);
    if (!btn) return;
    btn.addEventListener('click', () => {
      const overlay = btn.closest('.modal-overlay');
      if (overlay) closeModal(overlay.id);
    });
  });

  // Theme buttons live in the settings pane
  document.querySelectorAll('.theme-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const theme = btn.dataset.theme;
      document.body.setAttribute('data-theme', theme);
      localStorage.setItem('fabTheme', theme);
      highlightActiveThemeBtn(theme);
      if (currentData) renderTab(activeTab);
    });
  });
}

function openOpponentModal(opponentName, opponentGemId, events) {
  const allMatches = [];
  events.forEach(ev => {
    ev.matches.forEach(m => {
      if (m.opponentGemId === opponentGemId || m.opponentName === opponentName) {
        allMatches.push({
          hero: ev.hero || '?',
          eventTitle: ev.title,
          eventDate: ev.dateTime || ev.dateText,
          result: m.result,
          round: m.round
        });
      }
    });
  });

  // Sort newest first
  allMatches.sort((a, b) => new Date(b.eventDate) - new Date(a.eventDate));

  const wins = allMatches.filter(m => m.result === 'Win').length;
  const losses = allMatches.filter(m => m.result === 'Loss').length;
  const wr = wins + losses > 0 ? ((wins / (wins + losses)) * 100).toFixed(0) : '–';

  document.getElementById('modal-title').textContent = opponentName;
  document.getElementById('modal-sub').textContent = `GEM #${opponentGemId} · ${wins}W ${losses}L · ${wr}% win rate`;

  const container = document.getElementById('modal-matches');
  container.innerHTML = allMatches.map(m => `
    <div class="match-history-row">
      <span class="mh-hero">${m.hero}</span>
      <span class="mh-title" title="${m.eventTitle}">${m.eventTitle}</span>
      <span class="mh-result ${m.result === 'Win' ? 'wr-good' : m.result === 'Loss' ? 'wr-bad' : ''}">${m.result}</span>
      <span class="mh-date">${formatShortDate(m.eventDate)}</span>
    </div>
  `).join('');

  openModal('modal-overlay');
}

// ── DATA LOADING ──────────────────────────────────────────────────────────────
function loadStoredData() {
  chrome.runtime.sendMessage({ action: 'getStoredData' }, response => {
    if (response && response.fabStats) {
      currentData = response.fabStats;
      // Restore judge state from storage if available
      chrome.storage.local.get('judgeStateRef', result => {
        if (result.judgeStateRef) {
          judgeState = result.judgeStateRef; // { evId, view }
        }
        showDashboard();
      });
    } else {
      showEmpty();
    }
  });
}

function startScrape() {
  showLoading();
  const btn = document.getElementById('btn-scrape');
  btn.disabled = true;
  btn.textContent = 'Syncing…';

  chrome.tabs.query({ active: true, currentWindow: true }, tabs => {
    const isOnGem = tabs[0]?.url?.includes('gem.fabtcg.com');
    if (!isOnGem) {
      chrome.tabs.create({ url: 'https://gem.fabtcg.com/profile/history/', active: false }, () => {
        setTimeout(() => doScrape(btn), 1500);
      });
    } else {
      doScrape(btn);
    }
  });
}

function doScrape(btn) {
  chrome.runtime.sendMessage({ action: 'scrapeAllHistory' }, response => {
    btn.disabled = false;
    btn.textContent = 'Sync Data';
    if (response?.success) {
      currentData = response.data;
      showDashboard();
    } else {
      showEmpty();
      alert(`Sync failed: ${response?.error || 'Unknown error'}\n\nMake sure you're logged into GEM (gem.fabtcg.com) first.`);
    }
  });
}

// ── DISPLAY STATES ─────────────────────────────────────────────────────────────
function showLoading() {
  document.getElementById('status-empty').classList.add('hidden');
  document.getElementById('status-loading').classList.remove('hidden');
  document.querySelectorAll('.pane').forEach(p => p.classList.remove('active'));
}

function showEmpty() {
  document.getElementById('status-loading').classList.add('hidden');
  document.getElementById('status-empty').classList.remove('hidden');
  document.querySelectorAll('.pane').forEach(p => p.classList.remove('active'));
  document.getElementById('sync-info').textContent = 'No data loaded';
  document.getElementById('btn-export').classList.add('hidden');
}

function showDashboard() {
  document.getElementById('status-loading').classList.add('hidden');
  document.getElementById('status-empty').classList.add('hidden');
  document.getElementById('btn-export').classList.remove('hidden');

  const playerName = currentData.player?.name;
  if (playerName && playerName !== 'Unknown') {
    document.getElementById('player-name').textContent =
      `${playerName} · GEM ${currentData.player.gemId}`;
  } else {
    document.getElementById('player-name').textContent = '';
  }

  const evCount = currentData.events?.length || 0;
  document.getElementById('event-count').textContent = `${evCount} events`;
  document.getElementById('sync-info').textContent = `Last sync: ${formatDate(currentData.lastScrape)}`;

  // Init date range for trends
  if (currentData.events?.length) {
    const dates = currentData.events
      .map(e => parseEventDate(e.dateTime || e.dateText))
      .filter(Boolean)
      .sort((a, b) => a - b);
    if (dates.length) {
      document.getElementById('trend-from').value = toDateInput(dates[0]);
      document.getElementById('trend-to').value = toDateInput(dates[dates.length - 1]);
    }
  }

  showTab(activeTab);
}

// ── RENDER DISPATCH ───────────────────────────────────────────────────────────
function renderTab(tab) {
  const allEvents = currentData.events || [];
  // Show judge tab only if there are judge/scorekeeper events
  const judgeEvents = allEvents.filter(e => e.role === 'judge' || e.role === 'scorekeeper');
  const judgeTab = document.getElementById('tab-judge');
  judgeTab.classList.toggle('tab--hidden', judgeEvents.length === 0);

  switch(tab) {
    case 'overview':  renderOverview(allEvents); break;
    case 'heroes':    renderHeroes(allEvents); break;
    case 'opponents': renderOpponents(allEvents); break;
    case 'trends':    renderTrends(allEvents); break;
    case 'events':    renderEvents(allEvents); break;
    case 'settings':  renderSettings(); break;
    case 'judge':
      if (judgeState) {
        document.getElementById('judge-event-list').classList.add('hidden');
        document.getElementById('judge-detail').classList.add('judge-detail--visible');
        // If we have full data in memory use it, otherwise reload from network
        if (judgeState.tdata) {
          renderJudgeDetail(judgeState.ev, judgeState.tdata, judgeState.heroes, judgeState.standingsCsv);
        } else {
          // Popup was closed and reopened — find event by ID and reload
          const ev = judgeEvents.find(e => e.id === judgeState.evId);
          if (ev) {
            openJudgeDetail(ev);
          } else {
            judgeState = null;
            chrome.storage.local.remove('judgeStateRef');
            renderJudgeList(judgeEvents);
          }
        }
      } else {
        renderJudgeList(judgeEvents);
      }
      break;
  }
}

// ── OVERVIEW ──────────────────────────────────────────────────────────────────
function renderOverview(events) {
  const [w, l] = countWL(events);
  const total = w + l;
  const wr = total > 0 ? ((w / total) * 100).toFixed(1) : '–';
  const xp = events.reduce((s, e) => s + (e.xpGained || 0), 0);

  document.getElementById('overview-stats').innerHTML = `
    <div class="stat-card"><div class="val">${events.length}</div><div class="label">Events</div></div>
    <div class="stat-card"><div class="val">${w}</div><div class="label">Total Wins</div></div>
    <div class="stat-card"><div class="val ${wrClass(parseFloat(wr))}">${wr}%</div><div class="label">Win Rate</div></div>
    <div class="stat-card"><div class="val">${xp}</div><div class="label">XP Earned</div></div>
  `;

  const byType = groupBy(events, e => e.eventType || 'Other');
  document.getElementById('etype-body').innerHTML = Object.entries(byType)
    .sort((a, b) => b[1].length - a[1].length)
    .map(([type, evs]) => {
      const [tw, tl] = countWL(evs);
      const twr = tw + tl > 0 ? ((tw / (tw + tl)) * 100).toFixed(1) : '–';
      const typeId = 'etype-' + type.replace(/\W+/g, '_');

      // Sub-rows: one per event, sorted newest first
      const sortedEvs = [...evs].sort((a, b) => {
        const da = parseEventDate(a.dateTime || a.dateText);
        const db = parseEventDate(b.dateTime || b.dateText);
        return (db || 0) - (da || 0);
      });
      const subRows = sortedEvs.map(ev => {
        const [ew, el] = countWL([ev]);
        const ewr = ew + el > 0 ? ((ew/(ew+el))*100).toFixed(0) : '–';
        const heroCell = ev.hero
          ? `<span class="col-gold">${escHtml(ev.hero)}</span>`
          : `<span class="col-muted">–</span>`;
        return `<tr class="etype-subrow" data-parent="${typeId}">
          <td class="etype-subrow-date">${formatShortDate(ev.dateTime||ev.dateText)}</td>
          <td class="etype-sub-title" title="${escHtml(ev.title)}">${ev.title}</td>
          <td class="etype-sub-venue">${ev.venue||'–'}</td>
          <td>${heroCell}</td>
          <td class="col-win">${ew}</td>
          <td class="col-loss">${el}</td>
          <td class="${wrClass(parseFloat(ewr))}">${ewr}%</td>
          <td></td>
        </tr>`;
      }).join('');

      return `<tr class="etype-header-row" data-group="${typeId}" title="Click to expand">
        <td><span class="etype-arrow">▶</span> ${type}</td>
        <td>${evs.length}</td>
        <td class="col-win">${tw}</td>
        <td class="col-loss">${tl}</td>
        <td class="${wrClass(parseFloat(twr))}">${twr}%</td>
        <td><div class="wr-bar"><div class="wr-bar-win" style="width:${tw+tl>0?tw/(tw+tl)*100:0}%"></div></div></td>
      </tr>${subRows}`;
    }).join('');

  // Bind expand/collapse
  document.querySelectorAll('.etype-header-row').forEach(row => {
    row.addEventListener('click', () => {
      const groupId = row.dataset.group;
      const arrow = row.querySelector('.etype-arrow');
      const subRows = document.querySelectorAll(`.etype-subrow[data-parent="${groupId}"]`);
      const isOpen = subRows[0]?.style.display !== 'none';
      subRows.forEach(r => r.style.display = isOpen ? 'none' : 'table-row');
      if (arrow) arrow.style.transform = isOpen ? '' : 'rotate(90deg)';
    });
  });

  const byFmt = groupBy(events, e => e.format || 'Unknown');
  document.getElementById('format-body').innerHTML = Object.entries(byFmt)
    .sort((a, b) => b[1].length - a[1].length)
    .map(([fmt, evs]) => {
      const [w, l] = countWL(evs);
      const wr = w + l > 0 ? ((w / (w + l)) * 100).toFixed(1) : '–';
      return `<tr><td>${fmt}</td><td>${evs.length}</td><td class="col-win">${w}</td><td class="col-loss">${l}</td><td class="${wrClass(parseFloat(wr))}">${wr}%</td></tr>`;
    }).join('');

  const ps = currentData.profileStats;
  document.getElementById('elo-stats').innerHTML = ps ? `
    <div class="stat-card"><div class="val">${ps.elo || '–'}</div><div class="label">ELO</div></div>
    <div class="stat-card"><div class="val">${ps.xp90Day || '–'}</div><div class="label">90-Day XP</div></div>
    <div class="stat-card"><div class="val">${ps.xpLifetime || '–'}</div><div class="label">Lifetime XP</div></div>
    <div class="stat-card"><div class="val">#${ps.rankEloGlobal || '–'}</div><div class="label">ELO Global</div></div>
    <div class="stat-card"><div class="val">#${ps.rankEloCountry || '–'}</div><div class="label">ELO Country</div></div>
    <div class="stat-card"><div class="val">${ps.eventsTotal || '–'}</div><div class="label">Total Events</div></div>
  ` : '<div class="no-data-msg">Profile stats not available — try syncing again.</div>';
}

// ── HEROES ────────────────────────────────────────────────────────────────────
function renderHeroes(events) {
  const UNKNOWN_KEY = '? Unknown';
  const byHero = groupBy(events, e => e.hero || UNKNOWN_KEY);

  const known = Object.entries(byHero).filter(([h]) => h !== UNKNOWN_KEY);
  const unknownEvents = byHero[UNKNOWN_KEY] || [];
  let unknownMatches = 0;
  unknownEvents.forEach(ev => ev.matches.forEach(m => {
    if (m.result === 'Win' || m.result === 'Loss') unknownMatches++;
  }));

  const sorted = known.sort((a, b) => b[1].length - a[1].length);
  const maxEv = sorted.length > 0 ? Math.max(...sorted.map(([, evs]) => evs.length)) : 1;

  const heroRows = sorted.map(([hero, evs]) => {
    const [w, l] = countWL(evs);
    const wr = w + l > 0 ? ((w / (w + l)) * 100).toFixed(1) : '–';
    return `
      <div class="hero-row hero-row-clickable" data-hero="${escHtml(hero)}" title="Click for match details">
        <div class="hero-name hero-name-link" title="${escHtml(hero)}">${hero}</div>
        <div class="hero-bar-wrap"><div class="hero-bar-fill" style="width:${(evs.length/maxEv)*100}%"></div></div>
        <div class="hero-stats">
          <span class="${wrClass(parseFloat(wr))}">${wr}%</span>
          <span class="hero-stats-detail"> ${evs.length}ev · ${w}W ${l}L</span>
        </div>
      </div>`;
  }).join('');

  const unknownNote = unknownEvents.length > 0
    ? `<div class="hero-unknown-note">
        ${unknownEvents.length} event${unknownEvents.length !== 1 ? 's' : ''} (${unknownMatches} match${unknownMatches !== 1 ? 'es' : ''}) played with unknown hero — no decklist submitted.
       </div>`
    : '';

  document.getElementById('hero-list').innerHTML = heroRows + unknownNote;

  // Bind clicks
  document.querySelectorAll('.hero-row-clickable').forEach(row => {
    row.addEventListener('click', () => {
      const heroName = row.dataset.hero;
      const heroEvents = (byHero[heroName] || []);
      openHeroModal(heroName, heroEvents);
    });
  });
}

function openHeroModal(heroName, heroEvents) {
  const [w, l] = countWL(heroEvents);
  const wr = w + l > 0 ? ((w / (w + l)) * 100).toFixed(1) : '–';

  document.getElementById('hero-modal-title').textContent = heroName;
  document.getElementById('hero-modal-sub').textContent =
    `${heroEvents.length} events · ${w}W ${l}L · ${wr}% win rate`;

  // Build event breakdown
  const rows = [];
  // Sort newest first
  const sorted = [...heroEvents].sort((a, b) => {
    const da = parseEventDate(a.dateTime || a.dateText);
    const db = parseEventDate(b.dateTime || b.dateText);
    return (db || 0) - (da || 0);
  });

  sorted.forEach(ev => {
    const [ew, el] = countWL([ev]);
    const ewr = ew + el > 0 ? ((ew / (ew + el)) * 100).toFixed(0) : '–';

    // Event header row
    rows.push(`
      <div class="opp-card">
        <div class="opp-card-header">
          <div class="opp-card-name" title="${escHtml(ev.title)}">${ev.title}</div>
          <div class="opp-card-date">${formatShortDate(ev.dateTime || ev.dateText)}</div>
          <div class="opp-card-fmt">${ev.format || ''}</div>
          <div class="opp-card-score ${wrClass(parseFloat(ewr))}">${ew}–${el}</div>
        </div>
        ${ev.matches.map(m => `
          <div class="opp-match-row">
            <div class="opp-match-round">R${m.round}</div>
            <div class="opp-match-name">${escHtml(m.opponentName)} <span class="opp-match-gemid">#${m.opponentGemId}</span></div>
            <div class="opp-match-record">${m.record}</div>
            <div class="opp-match-result ${m.result === 'Win' ? 'wr-good' : m.result === 'Loss' ? 'wr-bad' : ''}">${m.result}</div>
          </div>
        `).join('')}
      </div>`);
  });

  document.getElementById('hero-modal-content').innerHTML = rows.join('');
  openModal('hero-modal-overlay');
}

// ── OPPONENTS ─────────────────────────────────────────────────────────────────
let opponentSort = 'matches'; // default

function renderOpponents(events) {
  const oppMap = {};
  events.forEach(ev => {
    ev.matches.forEach(m => {
      if (m.result === 'Bye') return;
      const key = m.opponentGemId || m.opponentName;
      if (!oppMap[key]) oppMap[key] = { name: m.opponentName, gemId: m.opponentGemId, wins: 0, losses: 0, count: 0 };
      if (m.result === 'Win') oppMap[key].wins++;
      if (m.result === 'Loss') oppMap[key].losses++;
      oppMap[key].count++;
    });
  });

  const allOpps = Object.values(oppMap);

  // Sort
  const sortFn = {
    matches: (a, b) => (b.wins + b.losses) - (a.wins + a.losses),
    wins:    (a, b) => b.wins - a.wins,
    losses:  (a, b) => b.losses - a.losses,
    wr:      (a, b) => {
      const wa = a.wins + a.losses > 0 ? a.wins / (a.wins + a.losses) : 0;
      const wb = b.wins + b.losses > 0 ? b.wins / (b.wins + b.losses) : 0;
      return wb - wa;
    },
    name:    (a, b) => a.name.localeCompare(b.name),
  };
  const sorted = [...allOpps].sort(sortFn[opponentSort] || sortFn.matches);

  // Filter + sort row
  const filterRow = document.getElementById('opponent-filter-row');
  filterRow.innerHTML = `
    <button class="filter-btn ${opponentFilter==='all'?'active':''}" data-filter="all">All (${sorted.length})</button>
    <button class="filter-btn ${opponentFilter==='won'?'active':''}" data-filter="won">Mostly Won</button>
    <button class="filter-btn ${opponentFilter==='lost'?'active':''}" data-filter="lost">Mostly Lost</button>
    <button class="filter-btn ${opponentFilter==='multi'?'active':''}" data-filter="multi">2+ Matches</button>
    <div class="opp-sort-row">
      <span class="opp-sort-label">Sort:</span>
      <select class="filter-select" id="opp-sort-select">
        <option value="matches" ${opponentSort==='matches'?'selected':''}>Matches</option>
        <option value="wins"    ${opponentSort==='wins'   ?'selected':''}>Wins</option>
        <option value="losses"  ${opponentSort==='losses' ?'selected':''}>Losses</option>
        <option value="wr"      ${opponentSort==='wr'     ?'selected':''}>Win Rate</option>
        <option value="name"    ${opponentSort==='name'   ?'selected':''}>Name</option>
      </select>
    </div>
  `;
  filterRow.querySelectorAll('.filter-btn').forEach(b => b.addEventListener('click', () => {
    opponentFilter = b.dataset.filter;
    renderOpponents(events);
  }));
  document.getElementById('opp-sort-select').addEventListener('change', e => {
    opponentSort = e.target.value;
    renderOpponents(events);
  });

  let filtered = sorted;
  if (opponentFilter === 'won')   filtered = sorted.filter(o => o.wins >= o.losses);
  if (opponentFilter === 'lost')  filtered = sorted.filter(o => o.losses > o.wins);
  if (opponentFilter === 'multi') filtered = sorted.filter(o => o.wins + o.losses >= 2);

  document.getElementById('opponent-list').innerHTML = filtered.length === 0
    ? '<div class="no-data-msg">No opponents found.</div>'
    : `<table class="data-table">
        <thead><tr>
          <th>Name</th><th>GEM ID</th><th>W</th><th>L</th><th>WR%</th><th>Matches</th>
        </tr></thead>
        <tbody>${filtered.map(opp => {
          const total = opp.wins + opp.losses;
          const wr = total > 0 ? ((opp.wins / total) * 100).toFixed(0) : '–';
          return `<tr>
            <td><span class="opp-clickable" data-name="${escHtml(opp.name)}" data-gemid="${opp.gemId}">${opp.name}</span></td>
            <td class="col-muted">${opp.gemId}</td>
            <td class="col-win">${opp.wins}</td>
            <td class="col-loss">${opp.losses}</td>
            <td class="${wrClass(parseFloat(wr))}">${wr}%</td>
            <td class="col-dim">${total}</td>
          </tr>`;
        }).join('')}</tbody>
      </table>`;

  document.querySelectorAll('.opp-clickable').forEach(el => {
    el.addEventListener('click', () => {
      openOpponentModal(el.dataset.name, el.dataset.gemid, events);
    });
  });
}

// ── TRENDS ────────────────────────────────────────────────────────────────────
function renderTrends(allEvents) {
  const fromVal = document.getElementById('trend-from').value;
  const toVal   = document.getElementById('trend-to').value;
  const fromTs  = fromVal ? new Date(fromVal).getTime() : 0;
  const toTs    = toVal   ? new Date(toVal).getTime() + 86400000 : Infinity;

  const events = allEvents.filter(e => {
    const d = parseEventDate(e.dateTime || e.dateText);
    if (!d) return true;
    return d.getTime() >= fromTs && d.getTime() <= toTs;
  });

  const sorted = [...events].sort((a, b) => {
    const da = parseEventDate(a.dateTime || a.dateText);
    const db = parseEventDate(b.dateTime || b.dateText);
    return (da || 0) - (db || 0);
  });

  // Summary stats for filtered range
  const [w, l] = countWL(sorted);
  const xp = sorted.reduce((s, e) => s + (e.xpGained || 0), 0);
  const wr = w + l > 0 ? ((w / (w + l)) * 100).toFixed(1) : '–';
  document.getElementById('trend-stats').innerHTML = `
    <div class="stat-card"><div class="val">${sorted.length}</div><div class="label">Events (range)</div></div>
    <div class="stat-card"><div class="val ${wrClass(parseFloat(wr))}">${wr}%</div><div class="label">Win Rate</div></div>
    <div class="stat-card"><div class="val">${w}</div><div class="label">Wins</div></div>
    <div class="stat-card"><div class="val">${l}</div><div class="label">Losses</div></div>
    <div class="stat-card"><div class="val">${xp}</div><div class="label">XP Earned</div></div>
  `;

  // Chart width: use available pane width
  const pane = document.getElementById('pane-trends');
  const chartW = pane ? Math.max(300, pane.clientWidth - 64) : 680;

  // Rolling WR
  const wrPoints = sorted.map((ev, i) => {
    const window = sorted.slice(Math.max(0, i - 9), i + 1);
    const [ww, lw] = countWL(window);
    return { x: i, y: ww + lw > 0 ? ww / (ww + lw) : null, label: ev.dateText };
  }).filter(p => p.y !== null);
  drawLine('chart-winrate', wrPoints, { W: chartW, H: 110, minY: 0, maxY: 1, format: v => `${(v*100).toFixed(0)}%`, yLines: [0.5], color: 'var(--gold)', fill: 'rgba(200,151,42,0.12)' });

  // Monthly WR bar chart
  const byMonth = {};
  sorted.forEach(ev => {
    const d = parseEventDate(ev.dateTime || ev.dateText);
    if (!d) return;
    const key = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`;
    if (!byMonth[key]) byMonth[key] = { w: 0, l: 0 };
    const [w, l] = countWL([ev]);
    byMonth[key].w += w; byMonth[key].l += l;
  });
  const monthEntries = Object.entries(byMonth).sort();
  const monthPoints = monthEntries.map(([k, v], i) => ({
    x: i,
    y: v.w + v.l > 0 ? v.w / (v.w + v.l) : 0,
    label: k
  }));
  drawLine('chart-monthly', monthPoints, { W: chartW, H: 100, minY: 0, maxY: 1, format: v => `${(v*100).toFixed(0)}%`, color: 'var(--win)', fill: 'rgba(90,173,106,0.12)', showDots: true });

  // Cumulative XP
  let cum = 0;
  const xpPoints = sorted.map((ev, i) => { cum += ev.xpGained || 0; return { x: i, y: cum }; });
  drawLine('chart-xp', xpPoints, { W: chartW, H: 90, color: '#5090d0', fill: 'rgba(80,144,208,0.12)' });

  // ELO bars
  const rated = sorted.filter(e => e.isRated);
  if (rated.length > 0) {
    const eloPts = rated.map((ev, i) => {
      const n = parseFloat(ev.netRatingChange);
      return { x: i, y: isNaN(n) ? 0 : n, label: ev.title };
    });
    drawBars('chart-elo', eloPts, { W: chartW, H: 90 });
    document.getElementById('elo-chart-wrap').style.display = 'block';
  } else {
    document.getElementById('elo-chart-wrap').style.display = 'none';
  }

  // Hero trend
  renderHeroTrend(sorted);

  // Venue table
  const byVenue = groupBy(sorted, e => e.venue || 'Unknown');
  document.getElementById('venue-body').innerHTML = Object.entries(byVenue)
    .sort((a, b) => b[1].length - a[1].length)
    .map(([v, evs]) => {
      const [w, l] = countWL(evs);
      const wr = w + l > 0 ? ((w/(w+l))*100).toFixed(1) : '–';
      return `<tr><td>${v}</td><td>${evs.length}</td><td class="col-win">${w}</td><td class="col-loss">${l}</td><td class="${wrClass(parseFloat(wr))}">${wr}%</td></tr>`;
    }).join('');

  // Month table — newest first, rows clickable
  const monthEntriesDesc = [...monthEntries].reverse();
  document.getElementById('month-body').innerHTML = monthEntriesDesc.map(([key, v]) => {
    const wr = v.w + v.l > 0 ? ((v.w/(v.w+v.l))*100).toFixed(1) : '–';
    const monthEvs = sorted.filter(e => {
      const d = parseEventDate(e.dateTime||e.dateText);
      return d && `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}` === key;
    });
    const xpM = monthEvs.reduce((s, e) => s + (e.xpGained||0), 0);
    return `<tr class="month-row month-row-clickable" data-key="${key}" title="Click for details">
      <td class="col-gold-light">${formatMonthKey(key)}</td>
      <td>${monthEvs.length}</td>
      <td class="col-win">${v.w}</td>
      <td class="col-loss">${v.l}</td>
      <td class="${wrClass(parseFloat(wr))}">${wr}%</td>
      <td>${xpM}</td>
    </tr>`;
  }).join('');

  // Bind month row clicks — need access to sorted events
  document.querySelectorAll('.month-row').forEach(row => {
    row.addEventListener('click', () => {
      const key = row.dataset.key;
      const monthEvs = sorted.filter(e => {
        const d = parseEventDate(e.dateTime||e.dateText);
        return d && `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}` === key;
      });
      openMonthModal(key, monthEvs);
    });
  });
}

function openMonthModal(key, events) {
  const [w, l] = countWL(events);
  const wr = w + l > 0 ? ((w/(w+l))*100).toFixed(1) : '–';
  const xp = events.reduce((s, e) => s + (e.xpGained||0), 0);

  document.getElementById('month-modal-title').textContent = formatMonthKey(key);
  document.getElementById('month-modal-sub').textContent =
    `${events.length} Events · ${w}W ${l}L · ${wr}% Win Rate · ${xp} XP`;

  // Sort newest first within month
  const sorted = [...events].sort((a, b) => {
    const da = parseEventDate(a.dateTime || a.dateText);
    const db = parseEventDate(b.dateTime || b.dateText);
    return (db || 0) - (da || 0);
  });

  document.getElementById('month-modal-body').innerHTML = sorted.map(ev => {
    const [ew, el] = countWL([ev]);
    const ewr = ew + el > 0 ? ((ew/(ew+el))*100).toFixed(0) : '–';
    const heroCell = ev.hero
      ? `<span class="col-gold">${escHtml(ev.hero)}</span>`
      : `<span class="col-muted" style="font-style:italic">–</span>`;

    const matchRows = ev.matches.map(m => `
      <div class="opp-match-row opp-match-row--indented">
        <span class="opp-match-round">R${m.round}</span>
        <span>${escHtml(m.opponentName)}</span>
        <span class="opp-match-record">${m.record}</span>
        <span class="opp-match-result ${m.result==='Win'?'wr-good':m.result==='Loss'?'wr-bad':''}">${m.result}</span>
      </div>`).join('');

    return `
      <div class="opp-card">
        <div class="opp-card-header opp-card-header--5col">
          <div class="opp-card-name" title="${escHtml(ev.title)}">${ev.title}</div>
          <div class="opp-card-date">${formatShortDate(ev.dateTime||ev.dateText)}</div>
          <div>${heroCell}</div>
          <div class="opp-card-fmt">${ev.eventType||ev.format||'–'}</div>
          <div class="opp-card-score ${wrClass(parseFloat(ewr))}">${ew}–${el}</div>
        </div>
        ${matchRows}
      </div>`;
  }).join('');

  openModal('month-modal-overlay');
}

// ── EVENTS ────────────────────────────────────────────────────────────────────
function renderEvents(events) {
  const types = [...new Set(events.map(e => e.eventType).filter(Boolean))];
  const filterRow = document.getElementById('event-filter-row');
  filterRow.innerHTML = `
    <span class="col-dim" style="font-size:12px">Filter:</span>
    <button class="filter-btn ${eventTypeFilter==='all'?'active':''}" data-filter="all">All (${events.length})</button>
    ${types.map(t => `<button class="filter-btn ${eventTypeFilter===t?'active':''}" data-filter="${escHtml(t)}">${t}</button>`).join('')}
    <button class="btn-export" id="events-export" style="margin-left:auto">📊 Export</button>
  `;
  filterRow.querySelectorAll('.filter-btn').forEach(b => b.addEventListener('click', () => {
    eventTypeFilter = b.dataset.filter;
    renderEvents(events);
  }));
  document.getElementById('events-export')?.addEventListener('click', exportToCSV);

  const filtered = eventTypeFilter === 'all' ? events : events.filter(e => e.eventType === eventTypeFilter);

  document.getElementById('events-body').innerHTML = filtered.map(ev => {
    const [w, l] = countWL([ev]);
    const wr = w + l > 0 ? ((w/(w+l))*100).toFixed(0) : '–';
    const heroCell = ev.hero
      ? `<span class="col-gold">${escHtml(ev.hero)}</span>`
      : `<span class="col-muted">–</span>`;
    const dateDisplay = ev.status === 'active'
      ? '<span class="badge-active">⚡ Live</span>'
      : formatShortDate(ev.dateTime||ev.dateText);
    return `<tr${ev.status === 'active' ? ' class="event-row-active"' : ''}>
      <td class="col-dim event-date">${dateDisplay}</td>
      <td class="event-title" title="${escHtml(ev.title)}">${ev.title}</td>
      <td class="col-dim event-format">${ev.format||'–'}</td>
      <td>${heroCell}</td>
      <td class="event-score ${wrClass(parseFloat(wr))}">${w}–${l}</td>
      <td class="col-dim">${ev.xpGained||0}</td>
      <td class="event-rated">${ev.isRated ? '<span class="col-gold">●</span>' : '<span class="col-muted">○</span>'}</td>
    </tr>`;
  }).join('');
}

// ── EXPORT ────────────────────────────────────────────────────────────────────
function exportToCSV() {
  if (!currentData?.events) return;

  const rows = [['Date','Event','Venue','Format','Hero','Event Type','Rated','W','L','Win Rate %','XP','Round','Opponent','Opponent GEM ID','Result','Record']];

  currentData.events.forEach(ev => {
    const [w, l] = countWL([ev]);
    const wr = w + l > 0 ? ((w/(w+l))*100).toFixed(1) : '';
    if (ev.matches.length === 0) {
      rows.push([
        ev.dateText, ev.title, ev.venue||'', ev.format||'', ev.hero||'',
        ev.eventType||'', ev.isRated?'Yes':'No', w, l, wr, ev.xpGained||0,
        '','','','',''
      ]);
    } else {
      ev.matches.forEach(m => {
        rows.push([
          ev.dateText, ev.title, ev.venue||'', ev.format||'', ev.hero||'',
          ev.eventType||'', ev.isRated?'Yes':'No', w, l, wr, ev.xpGained||0,
          m.round, m.opponentName, m.opponentGemId, m.result, m.record
        ]);
      });
    }
  });

  // Build CSV
  const csv = rows.map(row =>
    row.map(cell => {
      const s = String(cell ?? '');
      return s.includes(',') || s.includes('"') || s.includes('\n') ? `"${s.replace(/"/g, '""')}"` : s;
    }).join(',')
  ).join('\n');

  const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' }); // BOM for Excel
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `fab-stats-${currentData.player?.name?.replace(/\s+/g,'_') || 'export'}-${new Date().toISOString().slice(0,10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

// ── CHARTS ────────────────────────────────────────────────────────────────────
function drawLine(id, points, opts = {}) {
  const svg = document.getElementById(id);
  if (!svg) return;
  const W = opts.W || 680, H = opts.H || 110;
  svg.setAttribute('width', W);
  svg.setAttribute('height', H);

  if (points.length < 2) {
    svg.innerHTML = `<text x="${W/2}" y="${H/2}" text-anchor="middle" fill="var(--text-muted)" font-size="12" font-family="Crimson Pro">Not enough data</text>`;
    return;
  }

  const pad = { t: 8, r: 12, b: 24, l: 38 };
  const cW = W - pad.l - pad.r, cH = H - pad.t - pad.b;
  const minY = opts.minY !== undefined ? opts.minY : Math.min(...points.map(p => p.y));
  const maxY = opts.maxY !== undefined ? opts.maxY : Math.max(...points.map(p => p.y));
  const rangeY = maxY - minY || 1;

  const px = i => pad.l + (i / Math.max(points.length - 1, 1)) * cW;
  const py = v => pad.t + cH - ((v - minY) / rangeY) * cH;

  let html = '';

  // Y grid lines
  if (opts.yLines) opts.yLines.forEach(y => {
    const yy = py(y);
    html += `<line x1="${pad.l}" y1="${yy}" x2="${W-pad.r}" y2="${yy}" stroke="var(--border)" stroke-dasharray="4,4"/>`;
    html += `<text x="${pad.l-3}" y="${yy+4}" text-anchor="end" fill="var(--text-muted)" font-size="10">${opts.format ? opts.format(y) : y}</text>`;
  });

  // Y axis labels
  html += `<text x="${pad.l-3}" y="${py(maxY)+4}" text-anchor="end" fill="var(--text-muted)" font-size="10">${opts.format ? opts.format(maxY) : maxY.toFixed(1)}</text>`;
  html += `<text x="${pad.l-3}" y="${py(minY)+4}" text-anchor="end" fill="var(--text-muted)" font-size="10">${opts.format ? opts.format(minY) : minY.toFixed(1)}</text>`;

  // Fill
  if (opts.fill) {
    let p = `M ${px(0)} ${py(points[0].y)}`;
    points.forEach((pt, i) => { if (i > 0) p += ` L ${px(i)} ${py(pt.y)}`; });
    p += ` L ${px(points.length-1)} ${H-pad.b} L ${pad.l} ${H-pad.b} Z`;
    html += `<path d="${p}" fill="${opts.fill}"/>`;
  }

  // Line
  let line = `M ${px(0)} ${py(points[0].y)}`;
  points.forEach((pt, i) => { if (i > 0) line += ` L ${px(i)} ${py(pt.y)}`; });
  html += `<path d="${line}" fill="none" stroke="${opts.color||'var(--gold)'}" stroke-width="1.5"/>`;

  // Dots
  if (opts.showDots) points.forEach((pt, i) => {
    html += `<circle cx="${px(i)}" cy="${py(pt.y)}" r="3" fill="${opts.color||'var(--gold)'}"/>`;
    if (pt.label) {
      // Only show every N labels depending on count
      const step = Math.ceil(points.length / 10);
      if (i % step === 0) {
        html += `<text x="${px(i)}" y="${H-pad.b+14}" text-anchor="middle" fill="var(--text-muted)" font-size="9">${pt.label.substring(0,7)}</text>`;
      }
    }
  });

  svg.innerHTML = html;
}

function drawBars(id, points, opts = {}) {
  const svg = document.getElementById(id);
  if (!svg || points.length === 0) return;
  const W = opts.W || 680, H = opts.H || 90;
  svg.setAttribute('width', W);
  svg.setAttribute('height', H);

  const pad = { t: 8, r: 12, b: 20, l: 38 };
  const cW = W - pad.l - pad.r, cH = H - pad.t - pad.b;
  const maxAbs = Math.max(...points.map(p => Math.abs(p.y)), 0.01);
  const midY = pad.t + cH / 2;
  const bW = Math.max(2, cW / points.length - 2);

  let html = `<line x1="${pad.l}" y1="${midY}" x2="${W-pad.r}" y2="${midY}" stroke="var(--border)"/>`;
  points.forEach((p, i) => {
    const x = pad.l + (i / points.length) * cW + (cW / points.length - bW) / 2;
    const bH = (Math.abs(p.y) / maxAbs) * (cH / 2);
    const y = p.y >= 0 ? midY - bH : midY;
    const color = p.y >= 0 ? 'rgba(90,173,106,0.8)' : 'rgba(192,80,80,0.8)';
    html += `<rect x="${x}" y="${y}" width="${bW}" height="${Math.max(bH, 1)}" fill="${color}" rx="1"/>`;
  });

  svg.innerHTML = html;
}

// ── HERO TREND ────────────────────────────────────────────────────────────────
let selectedTrendHero = null;

function renderHeroTrend(sortedEvents) {
  const container = document.getElementById('hero-trend-list');
  if (!container) return;

  const byHero = {};
  sortedEvents.forEach(ev => {
    const hero = ev.hero;
    if (!hero || hero === '? Unknown') return;
    if (!byHero[hero]) byHero[hero] = [];
    byHero[hero].push(ev);
  });

  const allHeroes = Object.entries(byHero).sort((a, b) => b[1].length - a[1].length);

  if (allHeroes.length === 0) {
    container.innerHTML = '<div class="no-data-msg">No hero data available. Sync events with submitted decklists first.</div>';
    return;
  }

  if (!selectedTrendHero || !byHero[selectedTrendHero]) {
    selectedTrendHero = allHeroes[0][0];
  }

  const dropdownHtml = `
    <div class="hero-trend-controls">
      <label class="hero-trend-label">Hero:</label>
      <select id="hero-trend-select" class="filter-select">
        ${allHeroes.map(([hero, evs]) => {
          const [w, l] = countWL(evs);
          const wr = w + l > 0 ? ((w/(w+l))*100).toFixed(0) : '–';
          return `<option value="${escHtml(hero)}" ${hero === selectedTrendHero ? 'selected' : ''}>${hero} (${evs.length} events, ${wr}% WR)</option>`;
        }).join('')}
      </select>
    </div>
    <div id="hero-trend-chart"></div>`;

  container.innerHTML = dropdownHtml;

  document.getElementById('hero-trend-select').addEventListener('change', e => {
    selectedTrendHero = e.target.value;
    drawHeroTrendChart(byHero[selectedTrendHero] || [], selectedTrendHero);
  });

  drawHeroTrendChart(byHero[selectedTrendHero] || [], selectedTrendHero);
}

function drawHeroTrendChart(evs, heroName) {
  const container = document.getElementById('hero-trend-chart');
  if (!container) return;

  if (evs.length < 2) {
    container.innerHTML = `<div class="hero-trend-no-data">
      Only ${evs.length} event${evs.length !== 1 ? 's' : ''} with ${heroName} — need at least 2 to show a trend.
    </div>`;
    return;
  }

  const [wTotal, lTotal] = countWL(evs);
  const wrTotal = wTotal + lTotal > 0 ? ((wTotal / (wTotal + lTotal)) * 100).toFixed(1) : '–';

  // Split early vs recent
  const half = Math.floor(evs.length / 2);
  const [w1, l1] = countWL(evs.slice(0, half));
  const [w2, l2] = countWL(evs.slice(half));
  const wr1 = w1 + l1 > 0 ? w1 / (w1 + l1) : null;
  const wr2 = w2 + l2 > 0 ? w2 / (w2 + l2) : null;

  let trendIcon = '→', trendColor = 'var(--text-muted)', trendLabel = 'Stable';
  if (wr1 !== null && wr2 !== null) {
    const delta = wr2 - wr1;
    if (delta > 0.05)      { trendIcon = '↑'; trendColor = 'var(--win)';  trendLabel = `+${(delta*100).toFixed(0)}pp improvement`; }
    else if (delta < -0.05) { trendIcon = '↓'; trendColor = 'var(--loss)'; trendLabel = `${(delta*100).toFixed(0)}pp decline`; }
    else                    { trendIcon = '→'; trendColor = 'var(--gold)'; trendLabel = 'Stable'; }
  }

  // Rolling 3-event WR points
  const points = evs.map((ev, i) => {
    const win = evs.slice(Math.max(0, i - 2), i + 1);
    const [ww, ll] = countWL(win);
    return { x: i, y: ww + ll > 0 ? ww / (ww + ll) : null, label: formatShortDate(ev.dateTime || ev.dateText) };
  }).filter(p => p.y !== null);

  const pane = document.getElementById('pane-trends');
  const chartW = pane ? Math.max(300, pane.clientWidth - 64) : 620;
  const chartH = 130;
  const pad = { t: 10, r: 12, b: 28, l: 38 };
  const cW = chartW - pad.l - pad.r, cH = chartH - pad.t - pad.b;
  const px = i => pad.l + (i / Math.max(points.length - 1, 1)) * cW;
  const py = v => pad.t + cH - v * cH;

  // Build SVG
  let svg = `<svg width="${chartW}" height="${chartH}" style="display:block;overflow:visible">`;

  // 50% line
  svg += `<line x1="${pad.l}" y1="${py(0.5)}" x2="${chartW-pad.r}" y2="${py(0.5)}" stroke="var(--border)" stroke-dasharray="4,4"/>`;
  svg += `<text x="${pad.l-3}" y="${py(0.5)+4}" text-anchor="end" fill="var(--text-muted)" font-size="10">50%</text>`;
  svg += `<text x="${pad.l-3}" y="${py(1)+4}" text-anchor="end" fill="var(--text-muted)" font-size="10">100%</text>`;
  svg += `<text x="${pad.l-3}" y="${py(0)+4}" text-anchor="end" fill="var(--text-muted)" font-size="10">0%</text>`;

  // Fill under line
  let fill = `M ${px(0)} ${py(points[0].y)}`;
  points.forEach((p, i) => { if (i > 0) fill += ` L ${px(i)} ${py(p.y)}`; });
  fill += ` L ${px(points.length-1)} ${chartH-pad.b} L ${pad.l} ${chartH-pad.b} Z`;
  svg += `<path d="${fill}" fill="${trendColor}" opacity="0.1"/>`;

  // Line
  let line = `M ${px(0)} ${py(points[0].y)}`;
  points.forEach((p, i) => { if (i > 0) line += ` L ${px(i)} ${py(p.y)}`; });
  svg += `<path d="${line}" fill="none" stroke="${trendColor}" stroke-width="2"/>`;

  // Dots + date labels
  const step = Math.max(1, Math.ceil(points.length / 8));
  points.forEach((p, i) => {
    const isWin = p.y > 0.5;
    svg += `<circle cx="${px(i)}" cy="${py(p.y)}" r="4" fill="${isWin ? 'var(--win)' : 'var(--loss)'}" stroke="var(--bg-card)" stroke-width="1.5"/>`;
    if (i % step === 0 || i === points.length - 1) {
      svg += `<text x="${px(i)}" y="${chartH-pad.b+14}" text-anchor="middle" fill="var(--text-muted)" font-size="9">${p.label}</text>`;
    }
  });

  svg += `</svg>`;

  const summaryHtml = `
    <div class="trend-summary">
      <div class="trend-icon-large" style="color:${trendColor}">${trendIcon}</div>
      <div class="trend-label-group">
        <div class="trend-label-text" style="color:${trendColor}">${trendLabel}</div>
        <div class="trend-label-sub">Overall: <strong class="${wrClass(parseFloat(wrTotal))}">${wrTotal}%</strong></div>
      </div>
      <div class="trend-halves">
        <span>Early half: <strong>${wr1 !== null ? ((wr1*100).toFixed(0))+'%' : '–'}</strong> (${w1}W ${l1}L)</span>
        <span>Recent half: <strong>${wr2 !== null ? ((wr2*100).toFixed(0))+'%' : '–'}</strong> (${w2}W ${l2}L)</span>
        <span class="trend-halves-total">${evs.length} events total</span>
      </div>
    </div>`;

  container.innerHTML = `
    <div class="trend-hero-wrap">
      ${summaryHtml}
      ${svg}
    </div>`;
}

// ── JUDGE / SCOREKEEPER TAB ───────────────────────────────────────────────────

function renderJudgeList(events) {
  document.getElementById('judge-detail').classList.remove('judge-detail--visible');
  document.getElementById('judge-event-list').classList.remove('hidden');

  const sorted = [...events].sort((a, b) => {
    const da = parseEventDate(a.dateTime || a.dateText);
    const db = parseEventDate(b.dateTime || b.dateText);
    return (db || 0) - (da || 0);
  });

  document.getElementById('judge-event-list').innerHTML = sorted.map(ev => {
    const roleBadge = ev.role === 'judge'
      ? `<span class="judge-role-badge-judge">JUDGE</span>`
      : `<span class="judge-role-badge-scorekeeper">SCOREKEEPER</span>`;
    return `
      <div class="judge-event-card" data-id="${ev.id}">
        <div class="judge-card-row">
          ${roleBadge}
          <div class="judge-card-title">${escHtml(ev.title)}</div>
          <div class="judge-card-date">${formatShortDate(ev.dateTime || ev.dateText)}</div>
        </div>
        <div class="judge-card-meta">${ev.eventType || ''} ${ev.format ? '· ' + ev.format : ''} ${ev.venue ? '· ' + ev.venue : ''}</div>
        ${ev.runUrl ? '<div class="judge-card-link">Click to view tournament →</div>' : '<div class="judge-card-nolink">No run URL available</div>'}
      </div>`;
  }).join('') || '<div class="no-data-msg">No judge or scorekeeper events found.</div>';

  document.querySelectorAll('.judge-event-card').forEach(card => {
    card.addEventListener('click', () => {
      const ev = events.find(e => e.id === card.dataset.id);
      if (ev && ev.runUrl) openJudgeDetail(ev);
    });
  });
}

function openJudgeDetail(ev) {
  document.getElementById('judge-event-list').classList.add('hidden');
  document.getElementById('judge-detail').classList.add('judge-detail--visible');
  document.getElementById('judge-back-btn').onclick = () => {
    judgeState = null;
    chrome.storage.local.remove('judgeStateRef');
    renderJudgeList(
      (currentData.events || []).filter(e => e.role === 'judge' || e.role === 'scorekeeper')
    );
  };
  loadJudgeDetail(ev);
}

function loadJudgeDetail(ev) {
  const content = document.getElementById('judge-detail-content');
  content.innerHTML = `<div class="judge-loading">Loading tournament data…</div>`;

  Promise.all([
    new Promise((res, rej) => chrome.runtime.sendMessage({ action: 'fetchTournamentData', eventId: ev.id }, r => r.success ? res(r.data) : rej(r.error))),
    new Promise((res) => chrome.runtime.sendMessage({ action: 'fetchHeroes', eventId: ev.id }, r => res(r.success ? r.data : []))),
    new Promise((res) => chrome.runtime.sendMessage({ action: 'fetchStandings', eventId: ev.id }, r => res(r.success ? r.data : [])))
  ]).then(([tdata, heroes, standingsCsv]) => {
    judgeState = { ev, evId: ev.id, tdata, heroes, standingsCsv };
    // Persist event ID and view so the popup reopens to the same event
    chrome.storage.local.set({ judgeStateRef: { evId: ev.id, view: judgeState.view || 'breakdown' } });
    renderJudgeDetail(ev, tdata, heroes, standingsCsv);
  }).catch(err => {
    content.innerHTML = `<div class="judge-error">Error loading data: ${err}</div>`;
  });
}

// ── HERO IMAGE CACHE ──────────────────────────────────────────────────────────
const heroImageCache = {};

async function fetchHeroImage(heroName) {
  if (heroImageCache[heroName]) return heroImageCache[heroName];
  try {
    // Step 1: get card data from API
    const apiUrl = `https://api.goagain.dev/v1/cards?name=${encodeURIComponent(heroName)}`;
    const res = await fetch(apiUrl);
    const json = await res.json();
    const card = json.data?.[0];
    if (!card?.printings?.length) return null;

    // Prefer large CloudFront image, fallback to first available
    const printing = card.printings.find(p => p.image_url?.includes('large'))
                  || card.printings.find(p => p.image_url)
                  || null;
    if (!printing?.image_url) return null;

    // Step 2: fetch image bytes via background worker (bypasses CORS)
    const imgData = await new Promise((resolve) => {
      chrome.runtime.sendMessage(
        { action: 'fetchImageAsBase64', url: printing.image_url },
        r => resolve(r?.success ? r.dataUrl : null)
      );
    });
    if (!imgData) return null;

    // Step 3: load as Image element
    const img = await new Promise((resolve, reject) => {
      const i = new Image();
      i.onload = () => resolve(i);
      i.onerror = reject;
      i.src = imgData;
    });

    heroImageCache[heroName] = img;
    heroRawImageCache[heroName] = img;
    return img;
  } catch { return null; }
}

// Square crop of hero artwork
// FAB cards ~546x763px:
//   - Name box:    top ~0-8%   (0-61px)
//   - Artwork:     ~8%-60%     (61-458px) → height ~397px
//   - Text box:    ~60%-100%
// We crop a square from artwork center: take min(W, artH) as size
function cropHeroSquare(img, outSize) {
  const W = img.naturalWidth, H = img.naturalHeight;
  const artTop = Math.floor(H * 0.12);
  const artBot = Math.floor(H * 0.62);
  const artH   = artBot - artTop;
  const size   = Math.min(W, artH);
  const sx = Math.floor((W - size) / 2);
  const sy = artTop + Math.floor((artH - size) / 2);
  const canvas = document.createElement('canvas');
  canvas.width = outSize; canvas.height = outSize;
  const ctx = canvas.getContext('2d');
  ctx.drawImage(img, sx, sy, size, size, 0, 0, outSize, outSize);
  return canvas;
}

// Raw image element stored separately for pie slices (we need the full image to clip into a sector)
const heroRawImageCache = {};

// ── RENDER JUDGE DETAIL ───────────────────────────────────────────────────────

function renderJudgeDetail(ev, tdata, heroes, standingsCsv) {
  const content = document.getElementById('judge-detail-content');

  // Merge hero info into standings CSV entries
  const heroByGemId = {};
  const heroByNameLower = {};
  heroes.forEach(h => {
    if (h.gemId && h.hero) heroByGemId[h.gemId] = h.hero;
    if (h.name && h.hero) heroByNameLower[h.name.toLowerCase()] = h.hero;
  });

  // Use standings CSV if available, otherwise build from pairings
  const standings = (standingsCsv && standingsCsv.length > 0)
    ? standingsCsv.map(s => ({
        ...s,
        hero: heroByGemId[s.gemId] || heroByNameLower[s.name?.toLowerCase()] || null
      }))
    : buildStandings(tdata).map(s => ({
        ...s,
        hero: heroByGemId[s.gemId] || heroByNameLower[s.name?.toLowerCase()] || s.hero || null
      }));

  // Hero count
  const heroCount = {};
  heroes.forEach(h => {
    if (!h.hero) return;
    heroCount[h.hero] = (heroCount[h.hero] || 0) + 1;
  });
  const heroEntries = Object.entries(heroCount).sort((a, b) => b[1] - a[1]);
  const totalPlayers = heroes.length || tdata.players.length;

  const latestRound = tdata.rounds.length > 0 ? tdata.rounds[tdata.rounds.length - 1] : null;
  const inProgress = latestRound && latestRound.live > 0;
  const eventTitle = tdata.meta.title || ev.title;

  content.innerHTML = `
    <div class="judge-detail-header">
      <div class="judge-detail-title">${escHtml(eventTitle)}</div>
      <div class="judge-detail-meta">
        <span>${tdata.meta.type || ''}</span>
        <span>${tdata.meta.format || ''}</span>
        <span>${totalPlayers} players</span>
        ${tdata.meta.totalRounds ? `<span>${tdata.meta.totalRounds} rounds</span>` : ''}
        <span class="${inProgress ? 'judge-status-live' : 'judge-status-done'}">${inProgress ? '🟢 Round ' + latestRound.round + ' live' : tdata.meta.status || 'Done'}</span>
      </div>
    </div>

    <div class="judge-controls">
      <select class="filter-select" id="judge-view-select" style="flex:1;min-width:180px">
        <option value="breakdown" ${judgeState?.view === 'breakdown' || !judgeState?.view ? 'selected' : ''}>Hero Breakdown (bar chart)</option>
        <option value="pie" ${judgeState?.view === 'pie' ? 'selected' : ''}>Hero Distribution (pie chart)</option>
        <option value="pairings" ${judgeState?.view === 'pairings' ? 'selected' : ''}>Current Pairings</option>
        <option value="standings" ${judgeState?.view === 'standings' ? 'selected' : ''}>Standings</option>
      </select>
      <button id="judge-refresh-btn" class="filter-btn" title="Refresh this event">🔄 Refresh</button>
      <button id="judge-export-btn" class="btn-scrape" style="font-size:11px;padding:0 12px;height:28px">📥 Export PNG</button>
    </div>

    <div class="judge-canvas-wrap">
      <div id="judge-loading" class="judge-loading hidden"></div>
      <canvas id="judge-canvas" style="width:100%;display:block;border-radius:4px"></canvas>
    </div>`;

  // State
  let currentView = judgeState?.view || 'breakdown';
  const imgCache = {}; // heroName → cropped canvas

  // Preload all hero images in background
  const uniqueHeroes = [...new Set(heroes.map(h => h.hero).filter(Boolean))];

async function preloadImages() {
    const loadingEl = document.getElementById('judge-loading');
    const total = uniqueHeroes.length;
    let done = 0;

    const updateProgress = (hero) => {
      if (!loadingEl) return;
      loadingEl.classList.remove('hidden');
      loadingEl.innerHTML = `
        <div style="font-size:12px;color:var(--text-dim);margin-bottom:6px">Loading hero images… ${done}/${total}</div>
        <div class="judge-progress-bar-wrap">
          <div class="judge-progress-bar" style="width:${Math.round((done/total)*100)}%"></div>
        </div>
        <div class="judge-progress-hero">${hero || ''}</div>`;
    };

    updateProgress('');
    for (const hero of uniqueHeroes) {
      updateProgress(hero);
      const img = await fetchHeroImage(hero);
      if (img) imgCache[hero] = cropHeroSquare(img, 120);
      done++;
    }
    if (loadingEl) loadingEl.classList.add('hidden');
    drawCurrentView();
  }

  function drawCurrentView() {
    const canvas = document.getElementById('judge-canvas');
    if (!canvas) return;
    switch (currentView) {
      case 'breakdown': drawBreakdownView(canvas, heroEntries, totalPlayers, eventTitle, imgCache); break;
      case 'pie':       drawPieView(canvas, heroEntries, totalPlayers, eventTitle, imgCache); break;
      case 'pairings':  drawPairingsView(canvas, latestRound, tdata, heroes, eventTitle, imgCache); break;
      case 'standings': drawStandingsView(canvas, standings, tdata, eventTitle, imgCache); break;
    }  }

  document.getElementById('judge-view-select').addEventListener('change', e => {
    currentView = e.target.value;
    if (judgeState) {
      judgeState.view = currentView;
      chrome.storage.local.set({ judgeStateRef: { evId: judgeState.evId, view: currentView } });
    }
    drawCurrentView();
  });

  document.getElementById('judge-refresh-btn').addEventListener('click', () => {
    if (judgeState) loadJudgeDetail(judgeState.ev);
  });

  document.getElementById('judge-export-btn').addEventListener('click', () => {
    const canvas = document.getElementById('judge-canvas');
    if (!canvas) return;
    const link = document.createElement('a');
    link.download = `${currentView}-${Date.now()}.png`;
    link.href = canvas.toDataURL('image/png');
    link.click();
  });

  // Start: draw immediately without images, then redraw with images
  drawCurrentView();
  preloadImages();
}

// ── STANDINGS BUILDER ────────────────────────────────────────────────────────
function buildStandings(tdata) {
  const wins = {}, losses = {};
  tdata.rounds.forEach(r => {
    r.pairings.forEach(p => {
      if (!p.done) return;
      wins[p.p1] = (wins[p.p1] || 0);
      wins[p.p2] = (wins[p.p2] || 0);
      losses[p.p1] = (losses[p.p1] || 0);
      losses[p.p2] = (losses[p.p2] || 0);
      if (p.winner === 'p1') { wins[p.p1]++; losses[p.p2]++; }
      else if (p.winner === 'p2') { wins[p.p2]++; losses[p.p1]++; }
    });
  });
  const players = tdata.players.length > 0 ? tdata.players : Object.keys(wins).map(n => ({ name: n, gemId: '', hero: null }));
  return players
    .map(p => ({ ...p, wins: wins[p.name] || 0, losses: losses[p.name] || 0 }))
    .sort((a, b) => b.wins - a.wins || a.losses - b.losses);
}

// ── CANVAS DRAW FUNCTIONS ────────────────────────────────────────────────────

const COLORS = ['#c8972a','#5090d0','#5aad6a','#d04050','#9060d0','#50b0a0','#d08030','#c060a0','#60a0d0','#a0c040','#d06080','#80c080'];
const BG = '#0e0b07', GOLD = '#c8972a', GOLD_L = '#e8c060', TEXT = '#e8dcc8', TEXT_DIM = '#a09070';

function drawHeader(ctx, title, subtitle, W) {
  // Background
  ctx.fillStyle = BG;
  ctx.fillRect(0, 0, W, ctx.canvas.height);
  // Border
  ctx.strokeStyle = GOLD;
  ctx.lineWidth = 2;
  ctx.strokeRect(6, 6, W - 12, ctx.canvas.height - 12);
  ctx.strokeStyle = GOLD + '44';
  ctx.lineWidth = 1;
  ctx.strokeRect(11, 11, W - 22, ctx.canvas.height - 22);
  // Title
  ctx.fillStyle = GOLD_L;
  ctx.font = 'bold 18px serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(title, W / 2, 34);
  if (subtitle) {
    ctx.fillStyle = TEXT_DIM;
    ctx.font = '12px sans-serif';
    ctx.fillText(subtitle, W / 2, 54);
  }
  ctx.textBaseline = 'alphabetic';
}

function drawHeroThumb(ctx, imgCache, heroName, x, y, size) {
  const thumb = imgCache[heroName];
  if (thumb) {
    ctx.save();
    ctx.beginPath();
    ctx.roundRect ? ctx.roundRect(x, y, size, size, 4) : ctx.rect(x, y, size, size);
    ctx.clip();
    // thumb is a canvas (outSize×outSize) — must specify source rect explicitly
    ctx.drawImage(thumb, 0, 0, thumb.width, thumb.height, x, y, size, size);
    ctx.restore();
    ctx.strokeStyle = GOLD + '66';
    ctx.lineWidth = 1;
    ctx.strokeRect(x, y, size, size);
  } else {
    ctx.fillStyle = GOLD + '33';
    ctx.fillRect(x, y, size, size);
    ctx.fillStyle = GOLD;
    ctx.font = `bold ${Math.floor(size * 0.4)}px serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText((heroName || '?')[0], x + size / 2, y + size / 2);
    ctx.textBaseline = 'alphabetic';
  }
}

// 1. BREAKDOWN (bar chart with hero images)
function drawBreakdownView(canvas, heroEntries, total, title, imgCache) {
  const W = 1000, rowH = 44, padL = 300, padR = 200, padT = 76, imgS = 36;
  const H = heroEntries.length * rowH + padT + 30;
  canvas.width = W; canvas.height = H;
  const ctx = canvas.getContext('2d');
  drawHeader(ctx, title, `Hero Breakdown — ${total} players`, W);

  const maxCount = heroEntries[0]?.[1] || 1;
  const barW = W - padL - padR;

  heroEntries.forEach(([hero, count], i) => {
    const y = padT + i * rowH;
    const cy = y + rowH / 2;
    const pct = count / maxCount;
    const color = COLORS[i % COLORS.length];

    // Hero image
    drawHeroThumb(ctx, imgCache, hero, padL - imgS - 8, cy - imgS / 2, imgS);

    // Bar bg
    ctx.fillStyle = '#ffffff08';
    ctx.fillRect(padL, y + 8, barW, rowH - 16);
    // Bar fill
    const g = ctx.createLinearGradient(padL, 0, padL + barW * pct, 0);
    g.addColorStop(0, color); g.addColorStop(1, color + '88');
    ctx.fillStyle = g;
    ctx.fillRect(padL, y + 8, barW * pct, rowH - 16);

    // Rank
    ctx.fillStyle = i < 3 ? GOLD : '#ffffff22';
    ctx.beginPath(); ctx.arc(padL - imgS - 20, cy, 10, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = i < 3 ? '#000' : '#ffffff88';
    ctx.font = 'bold 10px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(i + 1, padL - imgS - 20, cy); ctx.textBaseline = 'alphabetic';

    // Hero name — truncate to fit available space
    ctx.fillStyle = TEXT;
    ctx.font = `${i < 3 ? 'bold ' : ''}12px sans-serif`;
    ctx.textAlign = 'right';
    const maxNameW = padL - imgS - 36; // available px for name
    let shortHero = hero;
    while (shortHero.length > 4 && ctx.measureText(shortHero).width > maxNameW) {
      shortHero = shortHero.slice(0, -2) + '…';
    }
    ctx.fillText(shortHero, padL - imgS - 32, cy + 4);

    // Count — clipped to stay within canvas
    const countStr = `${count}× (${((count / total) * 100).toFixed(0)}%)`;
    const countX = padL + barW * pct + 8;
    const countMaxW = W - 12 - countX;
    if (countMaxW > 20) {
      ctx.fillStyle = color;
      ctx.font = 'bold 12px sans-serif'; ctx.textAlign = 'left';
      ctx.save();
      ctx.rect(countX, y, countMaxW, rowH);
      ctx.clip();
      ctx.fillText(countStr, countX, cy + 4);
      ctx.restore();
    }

    // Separator
    if (i < heroEntries.length - 1) {
      ctx.strokeStyle = '#ffffff08'; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(padL - 60, y + rowH); ctx.lineTo(W - 20, y + rowH); ctx.stroke();
    }
  });
}

// 2. PIE CHART - hero image fills each slice via offscreen canvas clip
function drawPieView(canvas, heroEntries, total, title, imgCache) {
  const W = 800, H = Math.max(420, heroEntries.length * 22 + 120);
  canvas.width = W; canvas.height = H;
  const ctx = canvas.getContext('2d');
  drawHeader(ctx, title, `Hero Distribution — ${total} players`, W);

  const cx = 220, cy = H / 2 + 20, r = Math.min(160, (H - 100) / 2);
  let angle = -Math.PI / 2;

  heroEntries.forEach(([hero, count], i) => {
    const slice = (count / total) * Math.PI * 2;
    const color = COLORS[i % COLORS.length];
    const rawImg = heroRawImageCache[hero];

    if (rawImg) {
      const off = document.createElement('canvas');
      const size = r * 2;
      off.width = size; off.height = size;
      const octx = off.getContext('2d');

      // Clip to slice shape (pie center = size/2, size/2 in offscreen coords)
      octx.beginPath();
      octx.moveTo(size / 2, size / 2);
      octx.arc(size / 2, size / 2, r, angle, angle + slice);
      octx.closePath();
      octx.clip();

      // Visual center of this slice (centroid at ~2/3 radius from center)
      const midAngle = angle + slice / 2;
      const centroidDist = r * 0.60;
      const sliceCx = size / 2 + Math.cos(midAngle) * centroidDist;
      const sliceCy = size / 2 + Math.sin(midAngle) * centroidDist;

      // Artwork anchor in source image:
      //   X = horizontal center of card (iW/2)
      //   Y = top of artwork zone (8% offset) — this is the "face center" vertically
      const iW = rawImg.naturalWidth, iH = rawImg.naturalHeight;
      const artTopY = Math.floor(iH * 0.12);
      const anchorSrcX = iW / 2;
      const anchorSrcY = artTopY + Math.floor(iH * 0.19); // a bit into the artwork = face area

      // Scale so card width fills the slice area nicely
      const drawSize = r * 1.5;
      const scale = drawSize / iW;

      // Map anchor → slice centroid
      const dx = sliceCx - anchorSrcX * scale;
      const dy = sliceCy - anchorSrcY * scale;

      octx.drawImage(rawImg, 0, 0, iW, iH, dx, dy, iW * scale, iH * scale);

      // Color tint removed — artwork speaks for itself

      ctx.drawImage(off, cx - r, cy - r);
    } else {
      // Fallback solid color slice
      ctx.save();
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.arc(cx, cy, r, angle, angle + slice);
      ctx.closePath();
      ctx.fillStyle = color;
      ctx.fill();
      ctx.restore();
    }

    // Slice border on main canvas
    ctx.save();
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.arc(cx, cy, r, angle, angle + slice);
    ctx.closePath();
    ctx.strokeStyle = BG; ctx.lineWidth = 2; ctx.stroke();
    ctx.restore();

    angle += slice;
  });

  // Legend (right side)
  const legX = cx + r + 30, legStartY = 76;
  heroEntries.forEach(([hero, count], i) => {
    const ly = legStartY + i * 22;
    if (ly > H - 20) return;
    const color = COLORS[i % COLORS.length];
    ctx.fillStyle = color;
    ctx.beginPath(); ctx.arc(legX + 6, ly + 6, 6, 0, Math.PI * 2); ctx.fill();
    if (imgCache[hero]) drawHeroThumb(ctx, imgCache, hero, legX + 16, ly - 1, 14);
    ctx.fillStyle = TEXT;
    ctx.font = `${i < 3 ? 'bold ' : ''}11px sans-serif`;
    ctx.textAlign = 'left';
    const short = hero.length > 26 ? hero.slice(0, 25) + '…' : hero;
    ctx.fillText(`${short}  `, legX + 34, ly + 10);
    ctx.fillStyle = color;
    ctx.font = 'bold 11px sans-serif';
    const tw = ctx.measureText(short + '  ').width;
    ctx.fillText(`${count}×`, legX + 34 + tw, ly + 10);
  });
}

// 3. PAIRINGS with hero images
function drawPairingsView(canvas, latestRound, _tdata, heroes, title, imgCache) {
  if (!latestRound) {
    canvas.width = 600; canvas.height = 200;
    const ctx = canvas.getContext('2d');
    drawHeader(ctx, title, 'No pairings available', 600);
    return;
  }

  // Build hero lookup by GEM-ID (primary) and name (fallback)
  // GEM-ID is reliable; name can differ between run HTML ("Schauer, Alexander")
  // and heroes CSV ("Alexander Schauer")
  const heroByGemId = {};
  const heroByName  = {};
  heroes.forEach(h => {
    if (h.gemId && h.hero) heroByGemId[h.gemId] = h.hero;
    if (h.name  && h.hero) heroByName[h.name.toLowerCase()] = h.hero;
  });

  const W = 800, rowH = 56, padT = 76, imgS = 40;
  const H = latestRound.pairings.length * rowH + padT + 20;
  canvas.width = W; canvas.height = H;
  const ctx = canvas.getContext('2d');
  drawHeader(ctx, title, `Round ${latestRound.round} — ${latestRound.done}/${latestRound.total} matches done`, W);

  latestRound.pairings.forEach((p, i) => {
    const y = padT + i * rowH;
    const cy = y + rowH / 2;
    const bg = i % 2 === 0 ? '#ffffff05' : '#00000010';
    ctx.fillStyle = bg; ctx.fillRect(18, y, W - 36, rowH);

    const p1win = p.winner === 'p1', p2win = p.winner === 'p2';
    const p1hero = heroByGemId[p.p1GemId] || heroByName[p.p1?.toLowerCase()] || null;
    const p2hero = heroByGemId[p.p2GemId] || heroByName[p.p2?.toLowerCase()] || null;

    // Table number
    ctx.fillStyle = GOLD + '88'; ctx.font = 'bold 11px sans-serif';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(`T${p.table}`, 38, cy);

    // Player 1 side (left)
    const p1Color = p1win ? '#5aad6a' : p2win ? TEXT_DIM : TEXT;
    if (p1hero) drawHeroThumb(ctx, imgCache, p1hero, 56, cy - imgS / 2, imgS);
    ctx.fillStyle = p1Color;
    ctx.font = `${p1win ? 'bold ' : ''}12px sans-serif`;
    ctx.textAlign = 'left';
    ctx.fillText(abbreviateName(p.p1), 104, cy - 5);
    if (p1hero) {
      ctx.fillStyle = GOLD + '99'; ctx.font = '10px sans-serif';
      const sh = p1hero.length > 20 ? p1hero.slice(0, 19) + '…' : p1hero;
      ctx.fillText(sh, 104, cy + 8);
    }
    if (p1win) { ctx.fillStyle = '#5aad6a'; ctx.font = 'bold 14px sans-serif'; ctx.textAlign = 'right'; ctx.fillText('✓', W / 2 - 28, cy + 5); }

    // VS / result center
    ctx.fillStyle = p.done ? (p1win ? '#5aad6a88' : p2win ? '#5aad6a88' : TEXT_DIM) : TEXT_DIM;
    ctx.font = p.done ? 'bold 10px sans-serif' : '10px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(p.done ? (p1win ? 'W – L' : p2win ? 'L – W' : '? – ?') : 'vs', W / 2, cy + 4);

    // Player 2 side (right)
    const p2Color = p2win ? '#5aad6a' : p1win ? TEXT_DIM : TEXT;
    if (p2hero) drawHeroThumb(ctx, imgCache, p2hero, W - 56 - imgS, cy - imgS / 2, imgS);
    ctx.fillStyle = p2Color;
    ctx.font = `${p2win ? 'bold ' : ''}12px sans-serif`;
    ctx.textAlign = 'right';
    ctx.fillText(abbreviateName(p.p2), W - 104, cy - 5);
    if (p2hero) {
      ctx.fillStyle = GOLD + '99'; ctx.font = '10px sans-serif';
      const sh = p2hero.length > 20 ? p2hero.slice(0, 19) + '…' : p2hero;
      ctx.fillText(sh, W - 104, cy + 8);
    }
    if (p2win) { ctx.fillStyle = '#5aad6a'; ctx.font = 'bold 14px sans-serif'; ctx.textAlign = 'left'; ctx.fillText('✓', W / 2 + 28, cy + 5); }

    ctx.textBaseline = 'alphabetic';
    // Row separator
    ctx.strokeStyle = '#ffffff08'; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(18, y + rowH); ctx.lineTo(W - 18, y + rowH); ctx.stroke();
  });
}

// 4. STANDINGS with hero images
function drawStandingsView(canvas, standings, tdata, title, imgCache) {
  const W = 800, rowH = 44, padT = 76, imgS = 32;
  const show = standings.slice(0, 24);
  const H = show.length * rowH + padT + 20;
  canvas.width = W; canvas.height = H;
  const ctx = canvas.getContext('2d');
  drawHeader(ctx, title, `Standings after Round ${tdata.currentRound || '?'} — ${standings.length} players`, W);

  show.forEach((p, i) => {
    const y = padT + i * rowH;
    const cy = y + rowH / 2;
    const bg = i % 2 === 0 ? '#ffffff05' : '#00000010';
    ctx.fillStyle = bg; ctx.fillRect(18, y, W - 36, rowH);

    // Rank
    const rankColor = i === 0 ? '#e8c060' : i === 1 ? '#b0b8c0' : i === 2 ? '#c8835a' : TEXT_DIM;
    ctx.fillStyle = i < 3 ? rankColor : '#ffffff22';
    ctx.beginPath(); ctx.arc(36, cy, 14, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = i < 3 ? '#000' : TEXT_DIM;
    ctx.font = `bold ${i < 9 ? 12 : 10}px sans-serif`;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(i + 1, 36, cy); ctx.textBaseline = 'alphabetic';

    // Hero image
    if (p.hero) drawHeroThumb(ctx, imgCache, p.hero, 58, cy - imgS / 2, imgS);

    // Player name
    ctx.fillStyle = i < 3 ? GOLD_L : TEXT;
    ctx.font = `${i < 3 ? 'bold ' : ''}13px sans-serif`;
    ctx.textAlign = 'left';
    ctx.fillText(abbreviateName(p.name), 98, cy - 4);

    // Hero name
    if (p.hero) {
      ctx.fillStyle = GOLD + '88'; ctx.font = '10px sans-serif';
      const sh = p.hero.length > 28 ? p.hero.slice(0, 27) + '…' : p.hero;
      ctx.fillText(sh, 98, cy + 9);
    }

    // Record — wins only (CSV has no losses column)
    ctx.fillStyle = '#5aad6a'; ctx.font = 'bold 13px sans-serif'; ctx.textAlign = 'right';
    ctx.fillText(`${p.wins}W`, W - 30, cy + 4);

    // Separator
    ctx.strokeStyle = '#ffffff08'; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(18, y + rowH); ctx.lineTo(W - 18, y + rowH); ctx.stroke();
  });
}

// ── HELPERS ───────────────────────────────────────────────────────────────────

// "Alexander Schauer" → "A. S."  |  "Schauer, Alexander" → "A. S."
function abbreviateName(name) {
  if (!name) return '–';
  const normalized = name.includes(',')
    ? name.split(',').reverse().map(s => s.trim()).join(' ')
    : name.trim();
  return normalized.split(/\s+/).filter(Boolean).map(p => p[0].toUpperCase() + '.').join(' ');
}

function countWL(events) {
  let w = 0, l = 0;
  events.forEach(ev => (ev.matches || []).forEach(m => {
    if (m.result === 'Win') w++;
    if (m.result === 'Loss') l++;
  }));
  return [w, l];
}

function groupBy(arr, fn) {
  return arr.reduce((acc, item) => {
    const k = fn(item);
    (acc[k] = acc[k] || []).push(item);
    return acc;
  }, {});
}

function wrClass(wr) {
  if (isNaN(wr)) return '';
  if (wr >= 60) return 'wr-good';
  if (wr >= 40) return 'wr-mid';
  return 'wr-bad';
}

function parseEventDate(str) {
  if (!str) return null;
  // "March 15, 2026, 5:00 PM" or "Mar. 15, 2026"
  try {
    const d = new Date(str.replace(/\.$/, ''));
    return isNaN(d) ? null : d;
  } catch { return null; }
}

function toDateInput(date) {
  return date.toISOString().slice(0, 10);
}

function formatDate(ts) {
  if (!ts) return '–';
  return new Date(ts).toLocaleString('de-DE', { day:'2-digit', month:'2-digit', year:'numeric', hour:'2-digit', minute:'2-digit' });
}

function formatShortDate(str) {
  if (!str) return '–';
  const d = parseEventDate(str);
  if (!d) return str.substring(0, 12);
  return d.toLocaleDateString('de-DE', { day:'2-digit', month:'2-digit', year:'2-digit' });
}

function formatMonthKey(key) {
  const [year, month] = key.split('-');
  const d = new Date(parseInt(year), parseInt(month) - 1, 1);
  return d.toLocaleDateString('de-DE', { month: 'long', year: 'numeric' });
}

function escHtml(str) {
  return String(str || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}
