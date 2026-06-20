export function LicenseNotice({
  licenseCode,
  licenseNotice,
}: {
  licenseCode: string;
  licenseNotice: string;
}) {
  return (
    <section className="registry-panel license-notice" aria-labelledby="licensing">
      <h2 id="licensing">라이선스</h2>
      <p className="license-code">{licenseCode}</p>
      <p className="license-text">{licenseNotice}</p>
    </section>
  );
}
