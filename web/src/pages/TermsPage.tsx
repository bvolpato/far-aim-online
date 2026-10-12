import { Helmet } from 'react-helmet-async';

const sections = [
  {
    title: 'Educational Use',
    body: [
      'FAR/AIM Online provides aviation study and reference material for educational purposes. It is not a substitute for official FAA sources, flight instruction, preflight planning, legal advice, or pilot judgment.',
      'Pilots are responsible for confirming current regulations, notices, procedures, weather, aircraft data, and operational requirements before flight.',
    ],
  },
  {
    title: 'Reference Content',
    body: [
      'The app includes material based on FAA publications and federal regulations. We work to keep content current, but we do not guarantee that every item is complete, current, or error-free at all times.',
      'If official sources conflict with FAR/AIM Online, official sources control.',
    ],
  },
  {
    title: 'Acceptable Use',
    body: [
      'The MIT License governs project-authored code and grants the rights to use, copy, modify, merge, publish, distribute, sublicense, and sell copies, subject to its conditions. These terms do not narrow those rights. Separate notices and rights apply to third-party software and content. Do not disrupt the hosted website or attempt unauthorized access to it, or use the service in violation of applicable law.',
    ],
  },
  {
    title: 'No Warranty',
    body: [
      'FAR/AIM Online is provided as-is and as-available. To the fullest extent allowed by law, we disclaim warranties of merchantability, fitness for a particular purpose, and non-infringement.',
    ],
  },
  {
    title: 'Limitation of Liability',
    body: [
      'To the fullest extent allowed by law, FAR/AIM Online and its contributors are not liable for indirect, incidental, special, consequential, or punitive damages, or for losses related to use of or reliance on the app.',
    ],
  },
  {
    title: 'Changes',
    body: [
      'We may update these terms as the app changes. The effective date below reflects the latest published version.',
    ],
  },
];

export function TermsPage() {
  return (
    <>
      <Helmet>
        <title>Terms of Service | FAR/AIM Online</title>
        <meta
          name="description"
          content="Terms of Service for FAR/AIM Online, an aviation study and reference app."
        />
        <link rel="canonical" href="https://faraim.online/terms" />
      </Helmet>

      <div className="bg-secondary/30 border-b">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
          <p className="text-sm font-semibold text-primary mb-3">Effective April 30, 2026</p>
          <h1 className="text-4xl font-bold text-foreground">Terms of Service</h1>
          <p className="text-muted-foreground mt-4 text-lg">
            These terms apply to the FAR/AIM Online website and FAR/AIM Pro mobile apps.
          </p>
        </div>
      </div>

      <article className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-12 space-y-10">
        {sections.map((section) => (
          <section key={section.title} className="space-y-4">
            <h2 className="text-2xl font-semibold text-foreground">{section.title}</h2>
            {section.body.map((paragraph) => (
              <p key={paragraph} className="text-muted-foreground leading-7">
                {paragraph}
              </p>
            ))}
          </section>
        ))}
      </article>
    </>
  );
}
