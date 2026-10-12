import { LifeBuoy, Mail, RefreshCw } from 'lucide-react';
import { Helmet } from 'react-helmet-async';
import { Link } from 'react-router-dom';
import { Button } from '../components/ui/button';
import { Card, CardContent } from '../components/ui/card';

export function SupportPage() {
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
              Yes. The website is free to use. The iOS and Android apps will be free to download and use when released. No account, subscription, or in-app purchase is required.
            </p>
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
