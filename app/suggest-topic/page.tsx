import type { Metadata } from "next";
import SuggestTopicForm from "./SuggestTopicForm";

export const metadata: Metadata = {
  title: "Suggest a topic | 토픽 제안",
  description:
    "Suggest real-world facts that AI often gets wrong or that people frequently ask AI about.",
};

export default function SuggestTopicPage() {
  return <SuggestTopicForm />;
}
