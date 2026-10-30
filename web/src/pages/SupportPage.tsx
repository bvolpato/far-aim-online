import { Download, LifeBuoy, Mail, RefreshCw } from 'lucide-react';
import { useEffect } from 'react';
import { Helmet } from 'react-helmet-async';
import { Link, useLocation } from 'react-router-dom';
import { Button } from '../components/ui/button';
import { Card, CardContent } from '../components/ui/card';
import { androidRelease, iosAppUrl } from '@/lib/mobileApps';

export function SupportPage() {
  const { hash } = useLocation();

  useEffect(() => {
    if (hash === '#android-install') {
      document.getElementById('android-install')?.scrollIntoView({ block: 'start' });
    }
  }, [hash]);

  return (
    <div className="mx-auto max-w-3xl px-4 py-10">
      <Helmet>
        <title>Support | FAR/AIM Online</title>
        <meta name="description" content="FAR/AIM Online support, content issue reporting, and data source guidance." />
        <link rel="canonical" href="https://faraim.online/support" />
      </Helmet>

      <header className="mb-8">
        <div className="mb-3 flex items-center gap-3">
          <LifeBuoy className="h-7 w-7 text-primary" aria-hidden="true" />
          <h1 className="text-3xl font-bold text-foreground">Support</h1>
        </div>
        <p className="text-muted-foreground">
          Report content, search, display, or app reliability problems with enough detail to reproduce them.
        </p>
      </header>

      <div className="space-y-4">
        <Card>
          <CardContent className="p-6">
            <h2 className="mb-2 text-lg font-semibold">Is FAR/AIM Online free?</h2>
            <p className="text-sm text-muted-foreground">
              Yes. The website and mobile apps are free to use. Get the iPhone and iPad app from the{' '}
              <a href={iosAppUrl} className="text-primary underline underline-offset-4">App Store</a>,
              or download the Android APK directly from this website. No account, subscription, or in-app purchase is required.
            </p>
          </CardContent>
        </Card>

        <Card id="android-install" className="scroll-mt-24">
          <CardContent className="space-y-4 p-6">
            <h2 className="text-lg font-semibold">Install on Android</h2>
            <p className="text-sm text-muted-foreground">
              FAR/AIM Pro {androidRelease.version} (build {androidRelease.build}) requires Android 8.0 or later.
              Download the APK, then open it on your Android device. If prompted, allow your browser to install this app.
            </p>
            <Button asChild>
              <a href={androidRelease.url} download={androidRelease.filename}>
                <Download className="mr-2 h-4 w-4" aria-hidden="true" /> Download Android APK
              </a>
            </Button>
            <p className="text-sm text-muted-foreground">
              This APK is distributed directly from faraim.online. Updates are installed manually by downloading a newer APK here.
            </p>
            <p className="text-sm text-muted-foreground">
              Already using the Google Play testing version? Keep using Play for updates. This APK cannot update a Google Play installation.
            </p>
            <a href={androidRelease.checksumUrl} className="inline-block text-sm text-primary underline underline-offset-4">
              SHA-256 checksum
            </a>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-6">
            <h2 className="mb-2 text-lg font-semibold">Report a problem</h2>
            <p className="mb-4 text-sm text-muted-foreground">
              Include platform, app version, FAR/AIM/AC reference, expected result, and screenshot when relevant. Do not include personal flight records or account information.
            </p>
            <Button asChild>
              <a href="mailto:leetllmcontact@gmail.com?subject=FAR%2FAIM%20Online%20support">
                <Mail className="mr-2 h-4 w-4" aria-hidden="true" /> Email support
              </a>
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-6">
            <h2 className="mb-2 text-lg font-semibold">Reference freshness</h2>
            <p className="mb-4 text-sm text-muted-foreground">
              FAR/AIM Online packages dated source snapshots for offline use. Verify time-sensitive or operational information against current FAA publications before flight.
            </p>
            <Button variant="outline" asChild>
              <Link to="/updates">
                <RefreshCw className="mr-2 h-4 w-4" aria-hidden="true" /> View source status
              </Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
