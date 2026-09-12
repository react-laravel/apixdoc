import type { Metadata } from "next";
export const metadata: Metadata = {
  title: "恢复账号 · ApiX Docs",
  robots: { index: false, follow: false },
  referrer: "no-referrer",
};
export default function RecoveryLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
