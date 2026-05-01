(function () {
  const params    = new URLSearchParams(location.search);
  const evId      = params.get('evId') || '';
  const titleHint = params.get('title') || '';

  // ── HERO IMAGE CACHE ──────────────────────────────────────────────────────
  const heroDataUrlCache = new Map();

  function cropHeroSquare(img, outSize) {
    const W = img.naturalWidth, H = img.naturalHeight;
    const artTop = Math.floor(H * 0.12);
    const artBot = Math.floor(H * 0.62);
    const artH   = artBot - artTop;
    const size   = Math.min(W, artH);
    const sx     = Math.floor((W - size) / 2);
    const sy     = artTop + Math.floor((artH - size) / 2);
    const cv     = document.createElement('canvas');
    cv.width = outSize; cv.height = outSize;
    cv.getContext('2d').drawImage(img, sx, sy, size, size, 0, 0, outSize, outSize);
    return cv.toDataURL();
  }

  async function fetchHeroCroppedDataUrl(heroName) {
    if (!heroName || heroName === '?') return null;
    if (heroDataUrlCache.has(heroName)) return heroDataUrlCache.get(heroName);
    try {
      const res  = await fetch(`https://api.goagain.dev/v1/cards?name=${encodeURIComponent(heroName)}`);
      const json = await res.json();
      const card = json.data?.[0];
      if (!card?.printings?.length) { heroDataUrlCache.set(heroName, null); return null; }
      const p = card.printings.find(pr => pr.image_url?.includes('large'))
             || card.printings.find(pr => pr.image_url)
             || null;
      const imageUrl = p?.image_url;
      if (!imageUrl) { heroDataUrlCache.set(heroName, null); return null; }

      const dataUrl = await new Promise(resolve => {
        const img = new Image();
        img.crossOrigin = 'anonymous';
        img.onload  = () => resolve(cropHeroSquare(img, 52));
        img.onerror = () => resolve(null);
        img.src = imageUrl;
      });
      heroDataUrlCache.set(heroName, dataUrl);
      return dataUrl;
    } catch { heroDataUrlCache.set(heroName, null); return null; }
  }

  async function loadHeroImages(uniqueHeroes) {
    for (const hero of uniqueHeroes) {
      const dataUrl = await fetchHeroCroppedDataUrl(hero);
      if (dataUrl) {
        document.querySelectorAll(`img[data-hero="${CSS.escape(hero)}"]`).forEach(img => {
          img.src = dataUrl;
        });
      }
      await new Promise(r => setTimeout(r, 80));
    }
  }

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
      if (timerSecs <= 0) { clearInterval(timerTick); timerTick = null; startBtn.style.display = ''; pauseBtn.style.display = 'none'; }
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
  const bracketView     = document.getElementById('bracket-view');

  function updateLayout() {
    const top = header.offsetHeight + 'px';
    scrollContainer.style.top = top;
    bracketView.style.top = top;
  }

  window.addEventListener('resize', () => { updateLayout(); if (viewMode === 'bracket' && lastTdata) renderBracketFS(lastTdata, lastHeroes).catch(() => {}); });

  // ── INFINITE SCROLL ───────────────────────────────────────────────────────
  const SPEED = 60; // px / second
  let rafId = null, lastTs = null, scrollPos = 0, halfH = 0;

  function stopScroll() {
    if (rafId) { cancelAnimationFrame(rafId); rafId = null; }
    scrollInner.style.transform = 'translateY(0)';
    scrollPos = 0;
    lastTs = null;
  }

  function startInfiniteScroll() {
    if (rafId) cancelAnimationFrame(rafId);
    scrollPos = 0;
    lastTs = null;
    rafId = requestAnimationFrame(animateTick);
  }

  function animateTick(ts) {
    if (!lastTs) { lastTs = ts; rafId = requestAnimationFrame(animateTick); return; }
    const dt = (ts - lastTs) / 1000;
    lastTs = ts;
    scrollPos += SPEED * dt;
    if (halfH > 0 && scrollPos >= halfH) scrollPos -= halfH;
    scrollInner.style.transform = `translateY(-${scrollPos}px)`;
    rafId = requestAnimationFrame(animateTick);
  }

  function checkScroll(singleCopyContent) {
    stopScroll();
    // Measure single-copy height against available viewport
    scrollInner.innerHTML = singleCopyContent;
    const contentH  = scrollInner.scrollHeight;
    const availH    = scrollContainer.clientHeight;
    if (contentH <= availH + 10) return; // fits — no scroll
    // Duplicate for seamless infinite loop
    scrollInner.innerHTML = singleCopyContent + singleCopyContent;
    halfH = scrollInner.scrollHeight / 2;
    startInfiniteScroll();
  }

  // ── HTML ESCAPE ───────────────────────────────────────────────────────────
  function esc(s) {
    return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  // ── RENDER ────────────────────────────────────────────────────────────────
  function heroThumb(hero) {
    if (!hero || hero === '?') {
      return `<div class="hero-thumb hero-unknown">?</div>`;
    }
    return `<div class="hero-thumb"><img data-hero="${esc(hero)}" alt="${esc(hero)}"></div>`;
  }

  function renderPairings(tdata, heroes) {
    const heroByGemId = {}, heroByName = {};
    heroes.forEach(h => {
      if (h.gemId && h.hero) heroByGemId[h.gemId] = h.hero;
      if (h.name  && h.hero) heroByName[h.name.toLowerCase()] = h.hero;
    });

    document.getElementById('event-title').textContent =
      tdata.meta.title || titleHint || `Event ${evId}`;

    const latestRound = tdata.rounds.length > 0
      ? tdata.rounds[tdata.rounds.length - 1]
      : null;

    if (!latestRound || !latestRound.pairings?.length) {
      const html = '<div id="no-data">No pairings available for this event.</div>';
      scrollInner.innerHTML = html;
      return;
    }

    const done  = latestRound.done  || 0;
    const total = latestRound.total || latestRound.pairings.length;
    const live  = latestRound.live > 0;

    const rows = latestRound.pairings.map(p => {
      const isBye = !p.p2 || /^bye/i.test(p.p2);
      const p1h   = heroByGemId[p.p1GemId] || heroByName[(p.p1 || '').toLowerCase()] || null;
      const p2h   = !isBye && (heroByGemId[p.p2GemId] || heroByName[(p.p2 || '').toLowerCase()] || null);
      const p1win = p.winner === 'p1', p2win = p.winner === 'p2';

      const p1cls = p1win ? 'state-win' : p2win ? 'state-lose' : '';
      const p2cls = isBye ? 'state-bye' : p2win ? 'state-win' : p1win ? 'state-lose' : '';
      const vsText = p.done ? (p1win ? 'W – L' : p2win ? 'L – W' : '? – ?') : 'vs';

      return `<tr>
        <td class="td-table">T${esc(p.table)}</td>
        <td class="td-player ${p1cls}">
          <div class="player-cell">
            ${heroThumb(p1h)}
            <div class="player-info">
              <span class="player-name">${esc(p.p1 || '—')}</span>
              <span class="player-hero">${esc(p1h || '?')}</span>
            </div>
          </div>
        </td>
        <td class="td-vs ${p.done ? 'done' : ''}">${vsText}</td>
        <td class="td-player right ${p2cls}">
          <div class="player-cell right">
            <div class="player-info">
              <span class="player-name">${esc(isBye ? 'Bye' : (p.p2 || '—'))}</span>
              <span class="player-hero">${esc(isBye ? '' : (p2h || '?'))}</span>
            </div>
            ${heroThumb(isBye ? null : p2h)}
          </div>
        </td>
      </tr>`;
    }).join('');

    const singleCopy = `
      <div class="round-title">
        Round ${esc(latestRound.round)} · ${done}/${total} done${live ? ' · 🟢 Live' : ''}
      </div>
      <table class="pairings-table"><tbody>${rows}</tbody></table>`;

    updateLayout();
    checkScroll(singleCopy);

    // Async: load hero images into all matching elements (covers both copies if duplicated)
    const uniqueHeroes = [...new Set(
      latestRound.pairings.flatMap(p => [
        heroByGemId[p.p1GemId] || heroByName[(p.p1 || '').toLowerCase()] || null,
        heroByGemId[p.p2GemId] || heroByName[(p.p2 || '').toLowerCase()] || null
      ]).filter(Boolean)
    )];
    loadHeroImages(uniqueHeroes);
  }

  // ── TOP CUT VIEW ──────────────────────────────────────────────────────────
  let viewMode = 'pairings';
  let lastTdata = null, lastHeroes = null;

  const topCutBtn = document.getElementById('btn-topcut');

  topCutBtn.addEventListener('click', () => {
    viewMode = viewMode === 'pairings' ? 'bracket' : 'pairings';
    topCutBtn.textContent = viewMode === 'bracket' ? '📋 Pairings' : '🏆 Top Cut';
    if (viewMode === 'bracket') {
      scrollContainer.style.display = 'none';
      stopScroll();
      bracketView.style.display = 'block';
      if (lastTdata) renderBracketFS(lastTdata, lastHeroes);
    } else {
      bracketView.style.display = 'none';
      scrollContainer.style.display = '';
      if (lastTdata) renderPairings(lastTdata, lastHeroes);
    }
  });

  async function renderBracketFS(tdata, heroes) {
    const canvas = document.getElementById('bracket-canvas');
    if (!canvas) return;

    const heroByGemId = {}, heroByName = {};
    (heroes || []).forEach(h => {
      if (h.gemId && h.hero) heroByGemId[h.gemId] = h.hero;
      if (h.name  && h.hero) heroByName[h.name.toLowerCase()] = h.hero;
    });

    const elimRounds = tdata.rounds
      .filter(r => r.elimination)
      .sort((a, b) => a.round - b.round);

    const W = bracketView.clientWidth  || window.innerWidth;
    const H = bracketView.clientHeight || (window.innerHeight - header.offsetHeight);
    canvas.width = W; canvas.height = H;
    const ctx = canvas.getContext('2d');

    if (!elimRounds.length) {
      ctx.fillStyle = '#0e0b07'; ctx.fillRect(0, 0, W, H);
      ctx.fillStyle = '#666'; ctx.font = '16px sans-serif';
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText('No elimination playoff rounds found', W / 2, H / 2);
      return;
    }

    elimRounds.forEach(r => r.pairings.sort((a, b) => {
      const ta = typeof a.table === 'number' ? a.table : parseInt(String(a.table).replace(/\D/g, '')) || 999;
      const tb = typeof b.table === 'number' ? b.table : parseInt(String(b.table).replace(/\D/g, '')) || 999;
      return ta - tb;
    }));

    const uniqueHeroes = [...new Set(
      elimRounds.flatMap(r => r.pairings.flatMap(p => [
        heroByGemId[p.p1GemId] || heroByName[(p.p1 || '').toLowerCase()] || null,
        heroByGemId[p.p2GemId] || heroByName[(p.p2 || '').toLowerCase()] || null
      ])).filter(Boolean)
    )];

    const imgCacheFS = {};
    await Promise.all(uniqueHeroes.map(async hero => {
      const dataUrl = await fetchHeroCroppedDataUrl(hero);
      if (!dataUrl) return;
      await new Promise(resolve => {
        const img = new Image();
        img.onload = () => { imgCacheFS[hero] = img; resolve(); };
        img.onerror = () => resolve();
        img.src = dataUrl;
      });
    }));

    const GOLD = '#c8972a', BG = '#0e0b07', TEXT = '#e8d5b0', WIN = '#5aad6a';
    const numRounds       = elimRounds.length;
    const firstMatchCount = elimRounds[0].pairings.length;

    // All layout constants derived from available pixels so the bracket always fills the screen
    const PAD_X   = Math.max(12, Math.floor(W * 0.012));
    const PAD_Y   = Math.max(8,  Math.floor(H * 0.015));
    const TITLE_H = Math.max(44, Math.floor(H * 0.08));
    const LABEL_H = Math.max(18, Math.floor(H * 0.04));
    const CARD_GAP = Math.max(2, Math.floor(H * 0.004));

    const contentTop    = TITLE_H + LABEL_H;
    const availH        = H - contentTop - PAD_Y;
    const MATCH_GAP     = Math.max(4, Math.floor(availH * 0.025));
    const MATCH_H       = Math.floor((availH - Math.max(0, firstMatchCount - 1) * MATCH_GAP) / firstMatchCount);
    const PLAYER_H      = Math.floor((MATCH_H - CARD_GAP) / 2);
    const IMG_S         = Math.min(Math.floor(PLAYER_H * 0.75), Math.floor(W * 0.045));
    const COL_GAP       = Math.max(24, Math.floor(W * 0.05));
    const COL_W         = Math.floor((W - 2 * PAD_X - (numRounds - 1) * COL_GAP) / numRounds);

    const FONT_TITLE    = `bold ${Math.max(14, Math.floor(TITLE_H * 0.38))}px serif`;
    const FONT_SUBTITLE = `${Math.max(10, Math.floor(TITLE_H * 0.22))}px sans-serif`;
    const FONT_LABEL    = `bold ${Math.max(9,  Math.floor(LABEL_H * 0.55))}px sans-serif`;
    const FONT_NAME     = `${Math.max(11, Math.floor(PLAYER_H * 0.24))}px "Segoe UI", sans-serif`;
    const FONT_HERO     = `${Math.max(9,  Math.floor(PLAYER_H * 0.18))}px "Segoe UI", sans-serif`;
    const FONT_CHAMP    = `bold ${Math.max(8, Math.floor(PLAYER_H * 0.14))}px sans-serif`;

    // Background + border
    ctx.fillStyle = BG; ctx.fillRect(0, 0, W, H);
    ctx.strokeStyle = GOLD; ctx.lineWidth = 2; ctx.strokeRect(4, 4, W - 8, H - 8);
    ctx.strokeStyle = GOLD + '44'; ctx.lineWidth = 1; ctx.strokeRect(9, 9, W - 18, H - 18);

    // Title
    ctx.fillStyle = '#e8c060'; ctx.font = FONT_TITLE;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(tdata.meta.title || titleHint || 'Top Cut', W / 2, TITLE_H * 0.38);
    ctx.fillStyle = '#a09070'; ctx.font = FONT_SUBTITLE;
    ctx.fillText(`Top Cut — Round${numRounds > 1 ? 's' : ''} ${elimRounds.map(r => r.round).join(', ')}`, W / 2, TITLE_H * 0.75);
    ctx.textBaseline = 'alphabetic';

    // Match Y positions
    const slot = MATCH_H + MATCH_GAP;
    const matchPos = [];
    matchPos.push(elimRounds[0].pairings.map((_, mi) => {
      const topY = contentTop + mi * slot;
      return { topY, centerY: topY + MATCH_H / 2 };
    }));

    const srcMap = [null];
    for (let ri = 1; ri < numRounds; ri++) {
      const prevP = elimRounds[ri - 1].pairings;
      const srcs = elimRounds[ri].pairings.map((p, mi) => {
        let srcA = p.p1GemId ? prevP.findIndex(q => q.p1GemId === p.p1GemId || q.p2GemId === p.p1GemId) : -1;
        let srcB = p.p2GemId ? prevP.findIndex(q => q.p1GemId === p.p2GemId || q.p2GemId === p.p2GemId) : -1;
        if (srcA < 0 && srcB < 0) {
          const g = Math.max(1, Math.floor(prevP.length / elimRounds[ri].pairings.length));
          srcA = mi * g; srcB = Math.min(mi * g + g - 1, prevP.length - 1);
        } else if (srcA < 0) srcA = srcB;
        else if (srcB < 0) srcB = srcA;
        return { srcA, srcB };
      });
      const prevPos = matchPos[ri - 1];
      matchPos.push(elimRounds[ri].pairings.map((_, mi) => {
        const { srcA, srcB } = srcs[mi];
        const centerY = (prevPos[Math.max(0, srcA)].centerY + prevPos[Math.min(srcB, prevPos.length - 1)].centerY) / 2;
        return { topY: centerY - MATCH_H / 2, centerY };
      }));
      srcMap.push(srcs);
    }

    // Connector lines (draw first, behind cards)
    ctx.lineWidth = Math.max(1, Math.floor(W * 0.0008));
    ctx.strokeStyle = GOLD + '60';
    for (let ri = 0; ri < numRounds - 1; ri++) {
      const colX    = PAD_X + ri * (COL_W + COL_GAP);
      const nextColX = PAD_X + (ri + 1) * (COL_W + COL_GAP);
      const midX    = colX + COL_W + COL_GAP / 2;
      const prevPos = matchPos[ri];
      elimRounds[ri + 1].pairings.forEach((_, nmi) => {
        const { srcA, srcB } = srcMap[ri + 1][nmi];
        const yA  = prevPos[Math.max(0, srcA)].centerY;
        const yB  = prevPos[Math.min(srcB, prevPos.length - 1)].centerY;
        const nCy = matchPos[ri + 1][nmi].centerY;
        ctx.beginPath(); ctx.moveTo(colX + COL_W, yA); ctx.lineTo(midX, yA); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(colX + COL_W, yB); ctx.lineTo(midX, yB); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(midX, Math.min(yA, yB)); ctx.lineTo(midX, Math.max(yA, yB)); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(midX, nCy); ctx.lineTo(nextColX, nCy); ctx.stroke();
      });
    }

    // Round labels and match cards
    const allLabels  = ['Round of 16', 'Quarterfinals', 'Semifinals', 'Finals'];
    const labelStart = firstMatchCount >= 8 ? 0 : firstMatchCount >= 4 ? 1 : firstMatchCount >= 2 ? 2 : 3;

    const drawCard = (cx, cy, cw, ch, { name, heroName, isWinner, isLoser }) => {
      ctx.fillStyle = isWinner ? '#152015' : isLoser ? '#0d0c0a' : '#1a1510';
      ctx.fillRect(cx, cy, cw, ch);

      const PAD_IMG = Math.max(4, Math.floor(ch * 0.08));
      const imgX = cx + PAD_IMG, imgY = cy + (ch - IMG_S) / 2;
      const img = heroName ? imgCacheFS[heroName] : null;
      if (img) {
        ctx.save();
        ctx.beginPath();
        if (ctx.roundRect) ctx.roundRect(imgX, imgY, IMG_S, IMG_S, 3);
        else ctx.rect(imgX, imgY, IMG_S, IMG_S);
        ctx.clip();
        ctx.drawImage(img, imgX, imgY, IMG_S, IMG_S);
        ctx.restore();
        ctx.strokeStyle = isWinner ? '#5aad6a88' : GOLD + '55';
        ctx.lineWidth = 1; ctx.strokeRect(imgX, imgY, IMG_S, IMG_S);
      } else {
        ctx.fillStyle = '#2a2018'; ctx.fillRect(imgX, imgY, IMG_S, IMG_S);
        ctx.fillStyle = '#555'; ctx.font = `bold ${Math.floor(IMG_S * 0.4)}px sans-serif`;
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText('?', imgX + IMG_S / 2, imgY + IMG_S / 2);
      }

      const textX = imgX + IMG_S + PAD_IMG;
      const textW = cw - (textX - cx) - PAD_IMG;
      ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
      ctx.fillStyle = isWinner ? WIN : isLoser ? '#3a3a3a' : TEXT;
      ctx.font = `${isWinner ? 'bold ' : ''}${FONT_NAME}`;
      let dispName = name || '?';
      while (ctx.measureText(dispName).width > textW && dispName.length > 3) dispName = dispName.slice(0, -1);
      if (dispName !== (name || '?')) dispName += '…';
      ctx.fillText(dispName, textX, cy + ch / 2 - ch * 0.12);

      ctx.fillStyle = isWinner ? '#8acd8a' : isLoser ? '#2a2a2a' : GOLD + 'cc';
      ctx.font = FONT_HERO;
      let dispHero = heroName || '?';
      while (ctx.measureText(dispHero).width > textW && dispHero.length > 3) dispHero = dispHero.slice(0, -1);
      if (dispHero !== (heroName || '?')) dispHero += '…';
      ctx.fillText(dispHero, textX, cy + ch / 2 + ch * 0.14);
      ctx.textBaseline = 'alphabetic';
    };

    elimRounds.forEach((round, ri) => {
      const colX = PAD_X + ri * (COL_W + COL_GAP);
      ctx.fillStyle = GOLD; ctx.font = FONT_LABEL;
      ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic';
      ctx.fillText(
        (allLabels[Math.min(labelStart + ri, allLabels.length - 1)] || `Round ${round.round}`).toUpperCase(),
        colX + COL_W / 2, contentTop - Math.max(6, Math.floor(LABEL_H * 0.2))
      );

      round.pairings.forEach((p, mi) => {
        const pos    = matchPos[ri][mi];
        const p1Hero = heroByGemId[p.p1GemId] || heroByName[(p.p1 || '').toLowerCase()] || null;
        const p2Hero = heroByGemId[p.p2GemId] || heroByName[(p.p2 || '').toLowerCase()] || null;

        drawCard(colX, pos.topY, COL_W, PLAYER_H,
          { name: p.p1, heroName: p1Hero, isWinner: p.winner === 'p1', isLoser: p.done && p.winner === 'p2' });
        drawCard(colX, pos.topY + PLAYER_H + CARD_GAP, COL_W, PLAYER_H,
          { name: p.p2, heroName: p2Hero, isWinner: p.winner === 'p2', isLoser: p.done && p.winner === 'p1' });

        ctx.strokeStyle = '#2a2018'; ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(colX, pos.topY + PLAYER_H + CARD_GAP / 2);
        ctx.lineTo(colX + COL_W, pos.topY + PLAYER_H + CARD_GAP / 2);
        ctx.stroke();

        ctx.strokeStyle = GOLD + '33'; ctx.lineWidth = 1;
        ctx.strokeRect(colX, pos.topY, COL_W, MATCH_H);

        if (ri === numRounds - 1 && p.done) {
          const winY = p.winner === 'p1' ? pos.topY : pos.topY + PLAYER_H + CARD_GAP;
          ctx.fillStyle = '#e8c060'; ctx.font = FONT_CHAMP;
          ctx.textAlign = 'right';
          ctx.fillText('CHAMPION', colX + COL_W - Math.max(4, Math.floor(COL_W * 0.02)), winY + Math.floor(PLAYER_H * 0.22));
        }
      });
    });
  }

  // ── FETCH ─────────────────────────────────────────────────────────────────
  function fetchAndRender() {
    if (!evId) {
      scrollInner.innerHTML = '<div id="no-data">No event ID in URL.</div>';
      return;
    }

    Promise.all([
      new Promise((res, rej) =>
        chrome.runtime.sendMessage({ action: 'fetchTournamentData', eventId: evId },
          r => r?.success ? res(r.data) : rej(r?.error || 'Failed'))),
      new Promise(res =>
        chrome.runtime.sendMessage({ action: 'fetchHeroes', eventId: evId },
          r => res(r?.success ? r.data : [])))
    ]).then(([tdata, heroes]) => {
      lastTdata = tdata; lastHeroes = heroes;
      const hasElim = tdata.rounds.some(r => r.elimination);
      topCutBtn.style.display = hasElim ? '' : 'none';
      if (viewMode === 'bracket') {
        renderBracketFS(tdata, heroes);
      } else {
        renderPairings(tdata, heroes);
      }
      document.getElementById('refresh-info').textContent =
        `Auto-refresh alle 60s · Zuletzt: ${new Date().toLocaleTimeString('de-DE')}`;
    }).catch(err => {
      scrollInner.innerHTML = `<div id="no-data">Fehler beim Laden: ${esc(String(err))}</div>`;
    });
  }

  // ── INIT ──────────────────────────────────────────────────────────────────
  updateLayout();
  fetchAndRender();
  setInterval(fetchAndRender, 60_000);
})();
