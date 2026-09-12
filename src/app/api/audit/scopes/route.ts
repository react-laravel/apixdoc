import { auth } from "@/lib/auth";
import { auditScopes } from "@/lib/audit/read";
import {
  DocumentError,
  documentFailure,
  documentSuccess,
} from "@/lib/documents/http";
export async function GET() {
  try {
    const session = await auth();
    if (!session?.user?.id) throw new DocumentError("请先登录", 401);
    return documentSuccess(await auditScopes(session.user.id));
  } catch (error) {
    return documentFailure(error);
  }
}
