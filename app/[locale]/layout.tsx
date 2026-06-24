import { notFound } from "next/navigation";
import { isValidLocale } from "../../lib/i18n";

export default async function LocaleLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  if (!isValidLocale(locale)) notFound();

  const dir = locale === "ar" ? "rtl" : "ltr";

  return (
    <div lang={locale} dir={dir}>
      {children}
    </div>
  );
}
