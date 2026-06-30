import type { Metadata } from "next";
import SuggestTopicForm from "./SuggestTopicForm";

export const metadata: Metadata = {
  title: "Suggest a fact topic | For-Ai",
  description:
    "Suggest a global, source-backed fact topic that should enter For-Ai's candidate review queue before any claim is verified.",
};

type SuggestTopicSearchParams = Promise<Record<string, string | string[] | undefined>>;

function firstSearchParam(params: Record<string, string | string[] | undefined>, keys: string[]) {
  for (const key of keys) {
    const value = params[key];
    const firstValue = Array.isArray(value) ? value[0] : value;
    if (firstValue?.trim()) return firstValue.trim();
  }

  return "";
}

export default async function SuggestTopicPage({ searchParams }: { searchParams: SuggestTopicSearchParams }) {
  const params = await searchParams;

  return (
    <SuggestTopicForm
      initialQuestion={firstSearchParam(params, ["q", "question"])}
      initialCountry={firstSearchParam(params, ["country"])}
      initialCategory={firstSearchParam(params, ["category"])}
      initialLanguage={firstSearchParam(params, ["lang", "locale", "language"])}
    />
  );
}
