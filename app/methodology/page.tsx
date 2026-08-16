import { DEFAULT_LOCALE, LOCALE_CONFIG, SUPPORTED_LOCALES, isValidLocale } from "../../lib/i18n/locales";
import { getMethodologyContent } from "../../lib/i18n/methodology-content";

const STATUS_LABELS = ["Needs review", "Verified", "Stale / conflict"] as const;

type MethodologyPageProps = {
  searchParams: Promise<{ lang?: string | string[] }>;
};

export default async function MethodologyPage({ searchParams }: MethodologyPageProps) {
  const params = await searchParams;
  const candidate = Array.isArray(params.lang) ? params.lang[0] : params.lang;
  const requestedLocale = candidate && isValidLocale(candidate) ? candidate : DEFAULT_LOCALE;
  const content = getMethodologyContent(requestedLocale);

  return (
    <main className="min-h-screen bg-[#f6f8fb] px-5 py-12 text-slate-950" lang={content.contentLocale}>
      <div className="mx-auto max-w-3xl">
        <nav className="mb-8 flex flex-wrap gap-2" aria-label="Methodology language">
          {SUPPORTED_LOCALES.map((locale) => (
            <a
              key={locale}
              href={`/methodology?lang=${locale}`}
              lang={locale}
              aria-current={requestedLocale === locale ? "page" : undefined}
              className={`rounded-full border px-3 py-2 text-sm font-semibold ${requestedLocale === locale ? "border-sky-700 bg-sky-700 text-white" : "border-slate-300 bg-white text-slate-700"}`}
            >
              {LOCALE_CONFIG[locale].nativeName}
            </a>
          ))}
        </nav>

        <p className="text-sm font-semibold uppercase tracking-[0.2em] text-sky-700">{content.eyebrow}</p>
        <h1 className="mt-3 text-4xl font-bold tracking-tight">{content.title}</h1>
        <p className="mt-5 max-w-2xl text-lg leading-8 text-slate-600">{content.intro}</p>
        {content.fallback && (
          <p className="mt-4 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm leading-6 text-amber-950" role="status">
            Reviewed methodology copy is not yet available for {LOCALE_CONFIG[requestedLocale].nativeName}, so the canonical English version is shown.
          </p>
        )}

        <section className="mt-10 grid gap-4" aria-label="Verification workflow">
          {content.orderedSteps.map((step, index) => (
            <article key={step.id} className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
              <h2 className="text-xl font-bold">{index + 1}. {step.title}</h2>
              <p className="mt-3 leading-7 text-slate-600">{step.body}</p>
            </article>
          ))}
        </section>

        <section className="mt-8 rounded-3xl bg-slate-950 p-6 text-white" aria-labelledby="status-title">
          <p className="text-sm font-semibold text-sky-300">Verification states</p>
          <h2 id="status-title" className="mt-1 text-2xl font-bold">{content.statusTitle}</h2>
          <p className="mt-3 text-sm leading-6 text-slate-300">{content.statusBody}</p>
          <ul className="mt-5 grid gap-3 sm:grid-cols-3" aria-label="Verification states">
            {STATUS_LABELS.map((label) => <li key={label} className="rounded-2xl border border-slate-700 px-4 py-3 font-semibold">{label}</li>)}
          </ul>
        </section>
      </div>
    </main>
  );
}
