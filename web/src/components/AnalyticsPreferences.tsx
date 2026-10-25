import { useEffect, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import {
  analyticsConsentStorageKey,
  canOfferAnalytics,
  grantAnalytics,
  readAnalyticsConsent,
  revokeAnalytics,
  saveAnalyticsConsent,
  type AnalyticsConsent,
} from '@/lib/analytics';

export function AnalyticsPreferences() {
  const { pathname } = useLocation();
  const [eligible, setEligible] = useState(false);
  const [ready, setReady] = useState(false);
  const [consent, setConsent] = useState<AnalyticsConsent | null>(null);
  const [panelOpen, setPanelOpen] = useState(false);

  useEffect(() => {
    const canUseAnalytics = canOfferAnalytics();
    const storedConsent = canUseAnalytics ? readAnalyticsConsent() : null;
    setEligible(canUseAnalytics);
    setConsent(storedConsent);
    setPanelOpen(canUseAnalytics && storedConsent === null);
    setReady(true);
  }, []);

  useEffect(() => {
    if (!ready || !eligible) return;
    if (consent === 'accepted') {
      grantAnalytics(pathname);
    } else if (consent === 'denied') {
      revokeAnalytics();
    }
  }, [consent, eligible, pathname, ready]);

  useEffect(() => {
    if (!eligible) return;
    const syncConsent = (event: StorageEvent) => {
      if (event.key !== analyticsConsentStorageKey && event.key !== null) return;
      const nextConsent = event.newValue === 'accepted' || event.newValue === 'denied'
        ? event.newValue
        : null;
      if (nextConsent !== 'accepted') revokeAnalytics();
      setConsent(nextConsent);
      setPanelOpen(nextConsent === null);
    };
    window.addEventListener('storage', syncConsent);
    return () => window.removeEventListener('storage', syncConsent);
  }, [eligible]);

  const chooseConsent = (choice: AnalyticsConsent) => {
    saveAnalyticsConsent(choice);
    setConsent(choice);
    setPanelOpen(false);
    if (choice === 'denied') revokeAnalytics();
  };

  if (!eligible || !ready) return null;

  return (
    <>
      <button
        type="button"
        onClick={() => setPanelOpen((open) => !open)}
        aria-expanded={panelOpen}
        aria-controls="analytics-preferences-panel"
        className="rounded-sm underline underline-offset-4 hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        Analytics preferences
      </button>

      {panelOpen && (
        <section
          id="analytics-preferences-panel"
          role="region"
          aria-label="Analytics preferences"
          className="fixed left-3 right-3 top-20 z-40 max-h-[calc(100dvh-6rem)] overflow-y-auto rounded-xl border bg-background p-4 text-foreground shadow-xl sm:left-auto sm:right-4 sm:max-w-md sm:p-5"
        >
          <div className="space-y-2">
            <h2 className="text-base font-semibold">Optional analytics</h2>
            <p className="text-sm leading-relaxed text-muted-foreground">
              Google Analytics helps us understand aggregate website visits. Search terms, notes, and saved study data are not sent.{' '}
              <Link to="/privacy" className="underline underline-offset-2 hover:text-primary">
                Privacy policy
              </Link>
            </p>
            {consent && (
              <p className="text-sm text-muted-foreground" role="status">
                Analytics are {consent === 'accepted' ? 'on' : 'off'}.
              </p>
            )}
          </div>
          <div className="mt-4 flex flex-col gap-2 min-[380px]:flex-row">
            <button
              type="button"
              onClick={() => chooseConsent('accepted')}
              className="min-h-11 flex-1 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
            >
              Allow analytics
            </button>
            <button
              type="button"
              onClick={() => chooseConsent('denied')}
              className="min-h-11 flex-1 rounded-lg border bg-background px-4 py-2 text-sm font-semibold text-foreground hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
            >
              {consent === 'accepted' ? 'Turn off analytics' : consent === 'denied' ? 'Keep off' : 'No thanks'}
            </button>
          </div>
        </section>
      )}
    </>
  );
}
