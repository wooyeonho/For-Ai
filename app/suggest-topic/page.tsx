import type { Metadata } from "next";
import SuggestTopicForm from "./SuggestTopicForm";

export const metadata: Metadata = {
  title: "Suggest a fact topic | For-Ai",
  description:
    "Suggest a global, source-backed fact topic that should enter For-Ai's candidate review queue before any claim is verified.",
};

export default async function SuggestTopicPage({
  searchParams,
}: {
  searchParams?: Promise<{ q?: string; lang?: string }>;
}) {
  const params = await searchParams;
  return <SuggestTopicForm initialQuestion={params?.q ?? ""} initialLanguage={params?.lang ?? "en"} />;
}
