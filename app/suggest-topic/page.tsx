import type { Metadata } from "next";
import SuggestTopicForm from "./SuggestTopicForm";

export const metadata: Metadata = {
  title: "Suggest a topic | For-Ai",
  description:
    "Suggest real-world facts that AI systems often answer incorrectly or need verified sources for.",
};

export default function SuggestTopicPage() {
  return <SuggestTopicForm />;
}
