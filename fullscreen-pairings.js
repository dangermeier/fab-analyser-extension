(function () {
  const params    = new URLSearchParams(location.search);
  const evId      = params.get('evId') || '';
  const titleHint = params.get('title') || '';

  // ── TIMER ─────────────────────────────────────────────────────────────────
  let timerSecs = 0, timerTotal = 0, timerTick = null;

  const timerEl  = document.getElementById('timer-display');
  const bannerEl = document.getElementById('round-end-banner');
  const startBtn = document.getElementById('btn-start');
  const pauseBtn = document.getElementById('btn-pause');
  const resetBtn = document.getElementById('btn-reset');

  function fmt(s) {
    const m = Math.floor(s / 60), sec = s % 60;
    return `${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
  }

  function paintTimer() {
    timerEl.textContent = timerTotal > 0 ? fmt(Math.max(0, timerSecs)) : '––:––';
    timerEl.className = '';
    if (timerTotal > 0) {
      if (timerSecs <= 0)        { timerEl.classList.add('expired'); bannerEl.style.display = 'block'; }
      else if (timerSecs <= 300) { timerEl.classList.add('warn');    bannerEl.style.display = 'none';  }
      else                       {                                    bannerEl.style.display = 'none';  }
    }
  }

  function setPreset(mins) {
    clearInterval(timerTick); timerTick = null;
    timerTotal = timerSecs = mins * 60;
    paintTimer();
    startBtn.style.display = '';
    pauseBtn.style.display = 'none';
    resetBtn.style.display = '';
    bannerEl.style.display = 'none';
    timerEl.className = '';
  }

  function startTimer() {
    if (!timerTotal || timerSecs <= 0) return;
    startBtn.style.display = 'none';
    pauseBtn.style.display = '';
    resetBtn.style.display = '';
    timerTick = setInterval(() => {
      timerSecs = Math.max(0, timerSecs - 1);
      paintTimer();
      if (timerSecs <= 0) {
        clearInterval(timerTick); timerTick = null;
        startBtn.style.display = '';
        pauseBtn.style.display = 'none';
      }
    }, 1000);
  }

  function pauseTimer() {
    clearInterval(timerTick); timerTick = null;
    startBtn.style.display = '';
    pauseBtn.style.display = 'none';
  }

  function resetTimer() {
    clearInterval(timerTick); timerTick = null;
    timerSecs = timerTotal;
    paintTimer();
    startBtn.style.display = '';
    pauseBtn.style.display = 'none';
    bannerEl.style.display = 'none';
    timerEl.className = '';
  }

  document.getElementById('btn-55').addEventListener('click', () => setPreset(55));
  document.getElementById('btn-35').addEventListener('click', () => setPreset(35));
  startBtn.addEventListener('click', startTimer);
  pauseBtn.addEventListener('click', pauseTimer);
  resetBtn.addEventListener('click', resetTimer);

  // ── LAYOUT ────────────────────────────────────────────────────────────────
  const header          = document.getElementById('header');
  const scrollContainer = document.getElementById('scroll-container');
  const scrollInner     = document.getElementById('scroll-inner');

  function updateLayout() {
    scrollContainer.style.top = header.offsetHeight + 'px';
  }

  window.addEventListener('resize', () => { updateLayout(); checkScroll(); });

  // ── AUTO-SCROLL ──────────────────────────────────────────────────────────
  const SPEED    = 50;
  const PAUSE_MS = 3000;

  let scrollPos = 0, scrollDir = 1, scrollPaused = true;
  let rafId = null, lastTs = null;

  function startScroll() {
    stopScroll();
    scrollPos = 0; scrollDir = 1; scrollPaused = true; lastTs = null;
    setTimeout(() => { scrollPaused = false; rafId = requestAnimationFrame(tick); }, PAUSE_MS);
  }

  function stopScroll() {
    if (rafId) { cancelAnimationFrame(rafId); rafId = null; }
    scrollInner.style.transform = 'translateY(0)';
    scrollPos = 0;
  }

  function tick(ts) {
    if (!lastTs) lastTs = ts;
    const dt = (ts - lastTs) / 1000;
    lastTs = ts;

    if (!scrollPaused) {
      const maxScroll = scrollInner.scrollHeight - scrollContainer.clientHeight;
      if (maxScroll <= 0) { stopScroll(); return; }

      scrollPos += scrollDir * SPEED * dt;

      if (scrollPos >= maxScroll) {
        scrollPos = maxScroll; scrollDir = -1; scrollPaused = true;
        setTimeout(() => { scrollPaused = false; lastTs = null; }, PAUSE_MS);
      } else if (scrollPos <= 0) {
        scrollPos = 0; scrollDir = 1; scrollPaused = true;
        setTimeout(() => { scrollPaused = false; lastTs = null; }, PAUSE_MS);
      }

      scrollInner.style.transform = `translateY(-${scrollPos}px)`;
    }

    rafId = requestAnimationFrame(tick);
  }

  function checkScroll() {
    const maxScroll = scrollInner.scrollHeight - scrollContainer.clientHeight;
    if (maxScroll > 20) { if (!rafId) startScroll(); }
    else stopScroll();
  }

  // ── HTML ESCAPE ───────────────────────────────────────────────────────────
  function esc(s) {
    return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  // ── RENDER ────────────────────────────────────────────────────────────────
  function renderPairings(tdata) {
    document.getElementById('event-title').textContent =
      tdata.meta.title || titleHint || `Event ${evId}`;

    const latestRound = tdata.rounds.length > 0
      ? tdata.rounds[tdata.rounds.length - 1]
      : null;

    if (!latestRound || !latestRound.pairings?.length) {
      scrollInner.innerHTML = '<div id="no-data">No pairings available for this event.</div>';
      return;
    }

    const done  = latestRound.done  || 0;
    const total = latestRound.total || latestRound.pairings.length;
    const live  = latestRound.live > 0;

    const rows = latestRound.pairings.map(p => {
      const isBye = !p.p2 || /^bye/i.test(p.p2);
      const p1win = p.winner === 'p1', p2win = p.winner === 'p2';

      const p1cls = p1win ? 'state-win' : p2win ? 'state-lose' : '';
      const p2cls = isBye ? 'state-bye' : p2win ? 'state-win' : p1win ? 'state-lose' : '';
      const vsText = p.done ? (p1win ? 'W – L' : p2win ? 'L – W' : '? – ?') : 'vs';

      return `<tr>
        <td class="td-table">T${esc(p.table)}</td>
        <td class="td-player ${p1cls}">
          <span class="player-name">${esc(p.p1 || '—')}</span>
        </td>
        <td class="td-vs ${p.done ? 'done' : ''}">${vsText}</td>
        <td class="td-player right ${p2cls}">
          <span class="player-name">${esc(isBye ? 'Bye' : (p.p2 || '—'))}</span>
        </td>
      </tr>`;
    }).join('');

    scrollInner.innerHTML = `
      <div class="round-title">
        Round ${esc(latestRound.round)} · ${done}/${total} done${live ? ' · 🟢 Live' : ''}
      </div>
      <table class="pairings-table"><tbody>${rows}</tbody></table>`;
  }

  // ── FETCH ─────────────────────────────────────────────────────────────────
  function fetchAndRender() {
    if (!evId) {
      scrollInner.innerHTML = '<div id="no-data">No event ID in URL.</div>';
      return;
    }

    new Promise((res, rej) =>
      chrome.runtime.sendMessage({ action: 'fetchTournamentData', eventId: evId },
        r => r?.success ? res(r.data) : rej(r?.error || 'Failed'))
    ).then(tdata => {
      renderPairings(tdata);
      document.getElementById('refresh-info').textContent =
        `Auto-refresh alle 60s · Zuletzt: ${new Date().toLocaleTimeString('de-DE')}`;
      updateLayout();
      setTimeout(checkScroll, 150);
    }).catch(err => {
      scrollInner.innerHTML = `<div id="no-data">Fehler beim Laden: ${esc(String(err))}</div>`;
    });
  }

  // ── INIT ──────────────────────────────────────────────────────────────────
  updateLayout();
  fetchAndRender();
  setInterval(fetchAndRender, 60_000);
})();
