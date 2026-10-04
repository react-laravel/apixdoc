import { buttonVariants } from "@/components/ui/button";
import { auth } from "@/lib/auth";
import Link from "next/link";
import Image from "next/image";
import { redirect } from "next/navigation";

export default async function HomePage() {
  const session = await auth();

  if (session?.user) {
    redirect("/dashboard");
  }

  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-8 px-4">
      <div className="flex flex-col items-center gap-4 text-center">
        <Image src="/logo.svg" alt="ApiX Docs" width={64} height={64} />
        <p className="max-w-md text-lg text-zinc-600 dark:text-zinc-400">
          在线 API 文档管理与测试平台
        </p>
      </div>

      <Link href="/login" className={buttonVariants({ size: "lg" })}>登录</Link>
    </div>
  );
}
