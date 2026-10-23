// Google AdSense banner on the start screen.
// Fill in the publisher id (ca-pub-...) and the ad unit's slot id from the AdSense panel to turn it on.
// While they are empty no ad code loads; add ?anuncio=teste to the URL to see where the banner goes.
export const ADSENSE = { client: '', slot: '' };

export function setupAd(box) {
  if (!box) return;
  if (ADSENSE.client && ADSENSE.slot) {
    const ins = document.createElement('ins');
    ins.className = 'adsbygoogle';
    ins.style.display = 'block';
    ins.dataset.adClient = ADSENSE.client;
    ins.dataset.adSlot = ADSENSE.slot;
    ins.dataset.adFormat = 'horizontal';
    ins.dataset.fullWidthResponsive = 'true';
    box.append(ins);
    const s = document.createElement('script');
    s.async = true; s.crossOrigin = 'anonymous';
    s.src = 'https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=' + encodeURIComponent(ADSENSE.client);
    s.onload = () => { try { (window.adsbygoogle = window.adsbygoogle || []).push({}); } catch (e) { /* blocked */ } };
    document.head.append(s);
    box.hidden = false;   // the unit needs a visible box to measure; css hides it again if no ad comes
  } else if (new URLSearchParams(location.search).get('anuncio') === 'teste') {
    box.classList.add('demo');
    box.textContent = 'Anúncio';
    box.hidden = false;
  }
}
