import type { Metadata } from "next";
import SuggestTopicForm from "./SuggestTopicForm";

export const metadata: Metadata = {
  title: "Suggest a fact topic | For-Ai",
  description:
    "Suggest a global, source-backed fact topic that should enter For-Ai's candidate review queue before any claim is verified.",
};

export default function SuggestTopicPage() {
  return <SuggestTopicForm />;
}
