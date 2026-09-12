import type { Metadata } from "next";
import { JoinTeam } from "@/components/join-team";
export const metadata: Metadata = {
  title: "加入团队 · ApiX Docs",
  robots: { index: false, follow: false },
  referrer: "no-referrer",
};
export default function JoinPage() {
  return <JoinTeam />;
}
