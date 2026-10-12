import { Helmet } from 'react-helmet-async';

const sections = [
  {
    title: 'Publisher and Contact',
    body: [
      'FAR/AIM Online is published by Brrr1m. For privacy questions or deletion requests concerning information you sent to support, email leetllmcontact@gmail.com.',
    ],
  },
  {
    title: 'Information We Collect',
    body: [
      'FAR/AIM Online does not require an account and does not collect personal information through an app backend.',
      'The app and website may store reading history, search history, quiz progress, flashcard progress, saved references, highlights, notes, and theme preferences locally on your device or browser.',
      'If you export a study pack, it can include saved references, highlights, notes, reading history, and search history. You choose where the exported file is stored or shared. You can import a study pack from a file you select.',
      'Our static website host may process standard server logs, such as IP address, user agent, requested URL, and timestamp, to operate and protect the website.',
    ],
  },
  {
    title: 'How We Use Information',
    body: [
      'Local study data is used to provide app features such as recent reading history, search history, saved preferences, and progress tracking.',
      'Server logs, when processed by hosting providers, are used for website delivery, reliability, security, and abuse prevention.',
    ],
  },
  {
    title: 'Sharing',
    body: [
      'We do not sell personal information.',
      'We do not share personal information for cross-context behavioral advertising.',
      'Hosting providers may process technical logs as needed to run the website and related infrastructure.',
    ],
  },
  {
    title: 'Your Choices',
    body: [
      'You can clear local browser data, app data, or uninstall the app to remove locally stored study information. Delete any study-pack files you exported separately from the location where you saved them.',
      'You can use FAR/AIM Online without creating an account.',
    ],
  },
  {
    title: 'Security and Retention',
    body: [
      'The FAR/AIM Pro Android app does not transmit locally stored study data to FAR/AIM Online servers. The website uses HTTPS for data in transit.',
      'We do not retain app study data on a server. Local study data remains on your device or in your browser until you clear it or uninstall the app. Website hosts may retain technical access logs for service operation and security.',
    ],
  },
  {
    title: 'Children',
    body: [
      'FAR/AIM Online is an aviation study reference. It is not directed to children under 13.',
    ],
  },
  {
    title: 'Changes',
    body: [
      'We may update this policy as the app changes. The effective date above reflects the latest published version.',
    ],
  },
];

export function PrivacyPage() {
  return (
    <>
      <Helmet>
        <title>Privacy Policy | FAR/AIM Online</title>
        <meta
          name="description"
          content="Privacy Policy for FAR/AIM Online, including local study data, website logs, and user choices."
        />
        <link rel="canonical" href="https://faraim.online/privacy" />
      </Helmet>

      <div className="bg-secondary/30 border-b">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
          <p className="text-sm font-semibold text-primary mb-3">Effective September 27, 2026</p>
          <h1 className="text-4xl font-bold text-foreground">Privacy Policy</h1>
          <p className="text-muted-foreground mt-4 text-lg">
            FAR/AIM Online is built as an offline-first aviation study reference. We keep data collection minimal.
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
