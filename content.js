// content.js — injects the floating launcher button on gem.fabtcg.com

(function() {
  if (document.getElementById('fab-stats-btn')) return;

  const iconUrl = chrome.runtime.getURL('icons/icon48.png');

  // ── FLOATING BUTTON ─────────────────────────────────────────────────────────
  const btn = document.createElement('button');
  btn.id = 'fab-stats-btn';
  btn.title = 'FAB Stats Tracker';
  btn.innerHTML = `<img src="${iconUrl}" style="width:28px;height:28px;display:block;border-radius:4px">`;
  btn.style.cssText = `
    position: fixed;
    bottom: 24px;
    left: 24px;
    z-index: 999998;
    background: linear-gradient(135deg, #c8972a, #7a5410);
    border: none;
    border-radius: 10px;
    padding: 8px;
    cursor: pointer;
    box-shadow: 0 4px 18px rgba(0,0,0,0.45);
    display: flex;
    align-items: center;
    justify-content: center;
    transition: transform 0.15s, box-shadow 0.15s;
  `;
  btn.onmouseenter = () => {
    btn.style.transform = 'translateY(-2px)';
    btn.style.boxShadow = '0 7px 24px rgba(0,0,0,0.55)';
  };
  btn.onmouseleave = () => {
    btn.style.transform = '';
    btn.style.boxShadow = '0 4px 18px rgba(0,0,0,0.45)';
  };
  btn.onclick = toggleLightbox;
  document.body.appendChild(btn);

  // ── LIGHTBOX ────────────────────────────────────────────────────────────────
  let lightboxEl = null;
  let isOpen = false;

  function toggleLightbox() {
    if (isOpen) { closeLightbox(); return; }
    isOpen = true;

    if (!document.getElementById('fab-stats-keyframes')) {
      const style = document.createElement('style');
      style.id = 'fab-stats-keyframes';
      style.textContent = `
        @keyframes fabFadeIn  { from { opacity:0 } to { opacity:1 } }
        @keyframes fabSlideIn { from { opacity:0; transform:scale(0.96) translateY(10px) } to { opacity:1; transform:scale(1) translateY(0) } }
      `;
      document.head.appendChild(style);
    }

    const overlay = document.createElement('div');
    overlay.id = 'fab-stats-overlay';
    overlay.style.cssText = `
      position: fixed; inset: 0; z-index: 999999;
      background: rgba(0,0,0,0.72);
      display: flex; align-items: center; justify-content: center;
      backdrop-filter: blur(3px);
      animation: fabFadeIn 0.2s ease;
    `;

    const modal = document.createElement('div');
    modal.style.cssText = `
      width: min(761px, 95vw); height: min(602px, 92vh);
      border-radius: 12px; overflow: hidden;
      box-shadow: 0 24px 80px rgba(0,0,0,0.7);
      animation: fabSlideIn 0.22s ease;
      background: #0e0b07;
    `;

    const iframe = document.createElement('iframe');
    iframe.src = chrome.runtime.getURL('sidepanel.html');
    iframe.style.cssText = 'width:100%;height:100%;border:none;display:block';

    modal.appendChild(iframe);
    overlay.appendChild(modal);
    document.body.appendChild(overlay);
    lightboxEl = overlay;

    overlay.addEventListener('click', e => { if (e.target === overlay) closeLightbox(); });
    document.addEventListener('keydown', onEscape);

    btn.style.background = 'linear-gradient(135deg, #7a5410, #4a3008)';
  }

  function closeLightbox() {
    if (lightboxEl) {
      lightboxEl.style.animation = 'fabFadeIn 0.15s ease reverse';
      setTimeout(() => { lightboxEl?.remove(); lightboxEl = null; }, 150);
    }
    isOpen = false;
    document.removeEventListener('keydown', onEscape);
    btn.style.background = 'linear-gradient(135deg, #c8972a, #7a5410)';
  }

  function onEscape(e) {
    if (e.key === 'Escape') closeLightbox();
  }
})();
