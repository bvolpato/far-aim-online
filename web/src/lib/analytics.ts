const measurementId = 'G-VRZ5WP8Q5H';
export const analyticsConsentStorageKey = 'faraim-analytics-consent-v1';
const googleScriptUrl = `https://www.googletagmanager.com/gtag/js?id=${measurementId}`;
const analyticsDisableKey = `ga-disable-${measurementId}`;

export type AnalyticsConsent = 'accepted' | 'denied';

type Gtag = (...args: unknown[]) => void;

declare global {
  interface Window {
    dataLayer?: IArguments[];
    gtag?: Gtag;
  }
}

let scriptRequested = false;
let analyticsGranted = false;
let lastPagePath: string | null = null;
let previousPageLocation: string | null = null;

function hasPrivacyOptOut(): boolean {
  if (typeof window === 'undefined' || typeof navigator === 'undefined') return true;
  const windowSignals = window as Window & { doNotTrack?: string };
  const navigatorSignals = navigator as Navigator & { doNotTrack?: string; globalPrivacyControl?: boolean };
  return windowSignals.doNotTrack === '1' || navigatorSignals.doNotTrack === '1' || navigatorSignals.globalPrivacyControl === true;
}

export function canOfferAnalytics(): boolean {
  if (typeof window === 'undefined' || typeof navigator === 'undefined') return false;
  const hostname = window.location.hostname.toLowerCase();
  return (
    (hostname === 'faraim.online' || hostname === 'www.faraim.online') &&
    !navigator.webdriver &&
    !hasPrivacyOptOut()
  );
}

export function readAnalyticsConsent(): AnalyticsConsent | null {
  if (typeof window === 'undefined') return null;
  try {
    const value = window.localStorage.getItem(analyticsConsentStorageKey);
    return value === 'accepted' || value === 'denied' ? value : null;
  } catch {
    return null;
  }
}

export function saveAnalyticsConsent(consent: AnalyticsConsent): void {
  try {
    window.localStorage.setItem(analyticsConsentStorageKey, consent);
  } catch {
    // Keep the explicit choice for this page session if browser storage is unavailable.
  }
}

function getGtag(): Gtag {
  window.dataLayer = window.dataLayer || [];
  window.gtag = window.gtag || function (..._args: unknown[]) {
    window.dataLayer?.push(arguments);
  };
  return window.gtag;
}

function deniedConsent() {
  return {
    ad_storage: 'denied',
    ad_user_data: 'denied',
    ad_personalization: 'denied',
    analytics_storage: 'denied',
  };
}

function clearGoogleAnalyticsCookies(): void {
  if (typeof document === 'undefined') return;
  const cookies = document.cookie ? document.cookie.split(';') : [];
  for (const cookie of cookies) {
    const name = cookie.split('=')[0]?.trim();
    if (!name || !/^_ga(?:_|$)/.test(name)) continue;
    document.cookie = `${name}=; Max-Age=0; path=/; SameSite=Lax`;
    document.cookie = `${name}=; Max-Age=0; path=/; domain=faraim.online; SameSite=Lax`;
    document.cookie = `${name}=; Max-Age=0; path=/; domain=.faraim.online; SameSite=Lax`;
  }
}

function cleanPageLocation(pathname: string): string {
  const cleanPath = pathname.startsWith('/') ? pathname : `/${pathname}`;
  return `${window.location.origin}${cleanPath}`;
}

function cleanInitialReferrer(): string {
  if (!document.referrer) return '';
  try {
    const referrer = new URL(document.referrer);
    if (referrer.protocol !== 'http:' && referrer.protocol !== 'https:') return '';
    return referrer.origin === window.location.origin
      ? `${referrer.origin}${referrer.pathname}`
      : referrer.origin;
  } catch {
    return '';
  }
}

function pageTitleFor(pathname: string): string {
  if (pathname === '/') return 'Home';
  if (pathname.startsWith('/far')) return 'Federal Aviation Regulations';
  if (pathname.startsWith('/aim')) return 'Aeronautical Information Manual';
  if (pathname.startsWith('/glossary')) return 'Pilot/Controller Glossary';
  if (pathname.startsWith('/advisory-circulars')) return 'Advisory Circulars';
  if (pathname.startsWith('/quizzes')) return 'Quizzes';
  if (pathname.startsWith('/flashcards')) return 'Flashcards';
  if (pathname.startsWith('/study')) return 'Study';
  if (pathname.startsWith('/search')) return 'Search';
  if (pathname.startsWith('/updates')) return 'Updates';
  if (pathname.startsWith('/privacy')) return 'Privacy Policy';
  if (pathname.startsWith('/terms')) return 'Terms';
  if (pathname.startsWith('/support')) return 'Support';
  return 'FAR/AIM Online';
}

function queueGoogleTagConsent(): void {
  const gtag = getGtag();
  gtag('consent', 'default', deniedConsent());
  gtag('js', new Date());
}

function updateGoogleTagConsent(analyticsStorage: 'granted' | 'denied'): void {
  const gtag = getGtag();
  gtag('consent', 'update', {
    ...deniedConsent(),
    analytics_storage: analyticsStorage,
  });
}

function requestGoogleTagScript(): void {
  if (scriptRequested) return;
  const script = document.createElement('script');
  script.async = true;
  script.src = googleScriptUrl;
  script.onerror = () => {
    scriptRequested = false;
    script.remove();
  };
  scriptRequested = true;
  document.head.appendChild(script);
}

export function revokeAnalytics(): void {
  const wasGranted = analyticsGranted;
  analyticsGranted = false;
  lastPagePath = null;
  previousPageLocation = null;
  if (typeof window !== 'undefined') {
    Object.assign(window, { [analyticsDisableKey]: true });
    if (wasGranted && scriptRequested && window.gtag) updateGoogleTagConsent('denied');
  }
  clearGoogleAnalyticsCookies();
}

export function grantAnalytics(pathname: string): void {
  if (!canOfferAnalytics()) return;
  const needsTag = !scriptRequested;
  analyticsGranted = true;
  Object.assign(window, { [analyticsDisableKey]: false });
  if (needsTag) queueGoogleTagConsent();
  updateGoogleTagConsent('granted');
  trackAnalyticsPage(pathname);
  if (needsTag) requestGoogleTagScript();
}

export function trackAnalyticsPage(pathname: string): void {
  if (!analyticsGranted || !canOfferAnalytics() || pathname === lastPagePath) return;

  const pageLocation = cleanPageLocation(pathname);
  const pageReferrer = previousPageLocation ?? cleanInitialReferrer();
  const pageTitle = pageTitleFor(pathname);
  const gtag = getGtag();

  gtag('config', measurementId, {
    send_page_view: false,
    allow_google_signals: false,
    allow_ad_personalization_signals: false,
    cookie_expires: 60 * 24 * 60 * 60,
    cookie_update: false,
    page_location: pageLocation,
    page_referrer: pageReferrer,
    page_title: pageTitle,
  });
  gtag('set', {
    page_location: pageLocation,
    page_referrer: pageReferrer,
    page_title: pageTitle,
  });
  gtag('event', 'page_view', {
    page_location: pageLocation,
    page_referrer: pageReferrer,
    page_title: pageTitle,
  });

  lastPagePath = pathname;
  previousPageLocation = pageLocation;
}
