import { auth } from "@/lib/auth";
import { changeMember } from "@/lib/team/service";
import {
  TeamError,
  teamBody,
  teamFailure,
  teamSuccess,
} from "@/lib/team/errors";
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = await auth();
    if (!session?.user?.id) throw new TeamError("请先登录", 401);
    return teamSuccess(
      await changeMember(
        (await params).id,
        session.user,
        "transfer",
        await teamBody(request),
      ),
    );
  } catch (error) {
    return teamFailure(error);
  }
}
