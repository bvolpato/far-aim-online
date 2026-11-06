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
          className="fixed inset-x-0 bottom-0 z-40 max-h-[calc(100dvh-4rem)] overflow-y-auto border-t bg-background px-4 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] text-foreground shadow-[0_-2px_12px_rgb(0_0_0/0.06)]"
        >
          <div className="mx-auto flex max-w-7xl flex-col gap-2 sm:flex-row sm:items-center sm:justify-between sm:gap-6">
            <div>
              <h2 className="sr-only">Optional analytics</h2>
              <p className="text-sm leading-relaxed text-muted-foreground">
                Optional Google Analytics helps improve the site.{' '}
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
            <div className="flex shrink-0 gap-2">
              <button
                type="button"
                onClick={() => chooseConsent('accepted')}
                className="min-h-11 flex-1 rounded-md border px-3 py-2 text-sm font-medium hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 sm:flex-none"
              >
                Allow analytics
              </button>
              <button
                type="button"
                onClick={() => chooseConsent('denied')}
                className="min-h-11 flex-1 rounded-md border px-3 py-2 text-sm font-medium hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 sm:flex-none"
              >
                {consent === 'accepted' ? 'Turn off analytics' : consent === 'denied' ? 'Keep off' : 'No thanks'}
              </button>
            </div>
          </div>
        </section>
      )}
    </>
  );
}
