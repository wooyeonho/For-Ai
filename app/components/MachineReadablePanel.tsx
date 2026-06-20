import Link from "next/link";

export function MachineReadablePanel({
  apiUrl,
  rawMarkdownUrl,
}: {
  apiUrl: string;
  rawMarkdownUrl: string;
}) {
  return (
    <section className="registry-panel machine-panel" aria-labelledby="machine-links">
      <h2 id="machine-links">Machine-readable</h2>
      <div className="machine-links">
        <Link href={apiUrl} className="machine-link">
          <span className="machine-link-icon">{"{ }"}</span>
          <span>JSON API</span>
        </Link>
        <Link href={rawMarkdownUrl} className="machine-link">
          <span className="machine-link-icon">#</span>
          <span>Raw Markdown</span>
        </Link>
      </div>
    </section>
  );
}
