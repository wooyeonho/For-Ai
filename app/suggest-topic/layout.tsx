import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "토픽 제안",
  description:
    "AI가 자주 틀리거나 사람들이 AI에게 물어보는 실생활 정보를 GYEOL에 제안합니다.",
};

export default function SuggestTopicLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}
