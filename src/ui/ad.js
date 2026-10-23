// Google AdSense banner on the start screen.
// client: the AdSense publisher id. slot: the ad unit's id, made in the AdSense panel once the site is
// approved; until then only the AdSense script loads (that is what lets Google check the site).
// Ads load only on the hosts listed, never in local copies or previews; ?anuncio=teste shows where the banner goes.
export const ADSENSE = { client: 'ca-pub-7396245853161848', slot: '1536249343', hosts: ['ednesic.github.io'] };

function loadScript(onload) {
  const s = document.createElement('script');
  s.async = true; s.crossOrigin = 'anonymous';
  s.src = 'https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=' + encodeURIComponent(ADSENSE.client);
  if (onload) s.onload = onload;
  document.head.append(s);
}

export function setupAd(box) {
  if (!box) return;
  const live = ADSENSE.client && ADSENSE.hosts.includes(location.hostname);
  if (live && !ADSENSE.slot) loadScript();
  else if (live) {
    const ins = document.createElement('ins');
    ins.className = 'adsbygoogle';
    ins.style.display = 'block';
    ins.dataset.adClient = ADSENSE.client;
    ins.dataset.adSlot = ADSENSE.slot;
    ins.dataset.adFormat = 'horizontal';
    ins.dataset.fullWidthResponsive = 'true';
    box.append(ins);
    loadScript(() => { try { (window.adsbygoogle = window.adsbygoogle || []).push({}); } catch (e) { /* blocked */ } });
    box.hidden = false;   // the unit needs a visible box to measure; css hides it again if no ad comes
  } else if (new URLSearchParams(location.search).get('anuncio') === 'teste') {
    box.classList.add('demo');
    box.textContent = 'Anúncio';
    box.hidden = false;
  }
}
