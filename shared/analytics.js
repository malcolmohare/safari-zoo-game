// Google Analytics 4 for all of AIrcade (the arcade page and every game): page views plus custom events.
// Put your GA4 Measurement ID below (Google Analytics → Admin → Data streams → your web stream).
// While it's empty, or when running locally, nothing is loaded or sent.
const GA_MEASUREMENT_ID = '';

const Analytics = (() => {
  const local = location.protocol === 'file:' || ['localhost', '127.0.0.1', ''].includes(location.hostname);
  const enabled = !!GA_MEASUREMENT_ID && !local;

  function init() {
    if (!enabled) return;
    window.dataLayer = window.dataLayer || [];
    window.gtag = function gtag() { window.dataLayer.push(arguments); };
    window.gtag('js', new Date());
    window.gtag('config', GA_MEASUREMENT_ID);
    const s = document.createElement('script');
    s.async = true;
    s.src = `https://www.googletagmanager.com/gtag/js?id=${GA_MEASUREMENT_ID}`;
    document.head.appendChild(s);
  }

  // Send a custom event, e.g. track('safari_start', { day: 3 }). Never throws.
  function track(name, params = {}) {
    if (!enabled) return;
    try { window.gtag('event', name, params); } catch (e) { /* analytics must never break the game */ }
  }

  return { init, track };
})();
