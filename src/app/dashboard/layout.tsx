import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { DashboardNav } from "@/components/dashboard-nav";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await auth();

  if (!session?.user?.id) {
    redirect("/login");
  }

  // Get user info from DB
  const dbUser = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { name: true, email: true, role: true },
  });

  // Get project name if on a project page
  // We read it from the request URL via the children's metadata
  const userData = {
    name: dbUser?.name ?? session.user.name ?? "",
    email: dbUser?.email ?? session.user.email ?? "",
    role: dbUser?.role ?? "",
  };

  return (
    <div className="flex h-dvh min-h-0 flex-col overflow-hidden">
      <DashboardNav user={userData} />
      <main className="min-h-0 flex-1 overflow-auto p-3 sm:p-6">{children}</main>
    </div>
  );
}
