import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { DashboardNav } from "@/components/dashboard-nav";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await auth();

  if (!session?.user) {
    redirect("/login");
  }

  return (
    <div className="flex h-dvh min-h-0 flex-col overflow-hidden">
      <DashboardNav user={session.user} />
      <main className="min-h-0 flex-1 overflow-auto p-3 sm:p-6">{children}</main>
    </div>
  );
}
