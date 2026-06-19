import Link from "next/link";
import { notFound } from "next/navigation";
import { getRegistryBundleBySlug } from "../../../../lib/data";
import { RegistryHeader } from "../../../components/RegistryHeader";
import { DirectAnswerBox } from "../../../components/DirectAnswerBox";
import { ClaimTable } from "../../../components/ClaimTable";
import { MachineReadablePanel } from "../../../components/MachineReadablePanel";
import { CorrectionCTA } from "../../../components/CorrectionCTA";
import { HallucinationCTA } from "../../../components/HallucinationCTA";
import { LicenseNotice } from "../../../components/LicenseNotice";

function getStringDataValue(data: Record<string, unknown>, key: string, fallback: string): string {
  const value = data[key];
  return typeof value === "string" ? value : fallback;
}

function getMachineReadableUrl(data: Record<string, unknown>, key: "api_url" | "raw_markdown_url", fallback: string): string {
  const machineReadable = data.machine_readable;
  if (!machineReadable || typeof machineReadable !== "object") {
    return fallback;
  }
  const value = (machineReadable as Record<string, unknown>)[key];
  return typeof value === "string" ? value : fallback;
}

export default async function WikiDocumentPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const bundle = getRegistryBundleBySlug(slug);

  if (!bundle) {
    notFound();
  }

  const { entity, document, claims } = bundle;
  const directAnswer = getStringDataValue(document.data, "direct_answer", "확인 필요");
  const licenseNotice = getStringDataValue(document.data, "license_notice", "GYEOL Data License v0.1 placeholder.");
  const apiUrl = getMachineReadableUrl(document.data, "api_url", `/api/documents/${document.slug}`);
  const rawMarkdownUrl = getMachineReadableUrl(document.data, "raw_markdown_url", `/raw/${document.slug}.md`);

  return (
    <article>
      <RegistryHeader entity={entity} document={document} />

      <DirectAnswerBox answer={directAnswer} confidence={document.confidence} />

      <ClaimTable claims={claims} />

      <div className="cta-row">
        <CorrectionCTA slug={document.slug} />
        <HallucinationCTA slug={document.slug} />
        <Link href={`/diagnostics/${document.slug}`} className="cta-link cta-diagnostics">
          AI 진단
        </Link>
      </div>

      <MachineReadablePanel apiUrl={apiUrl} rawMarkdownUrl={rawMarkdownUrl} />

      <LicenseNotice licenseCode={document.license_code} licenseNotice={licenseNotice} />
    </article>
  );
}
