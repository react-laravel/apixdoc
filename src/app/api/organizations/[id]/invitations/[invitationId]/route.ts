import { auth } from "@/lib/auth";
import { createInvitation, revokeInvitation } from "@/lib/team/service";
import {
  TeamError,
  teamBody,
  teamFailure,
  teamSuccess,
} from "@/lib/team/errors";
type Context = { params: Promise<{ id: string; invitationId: string }> };
export async function PATCH(request: Request, { params }: Context) {
  try {
    const session = await auth();
    if (!session?.user?.id) throw new TeamError("请先登录", 401);
    const { id, invitationId } = await params;
    return teamSuccess(
      await createInvitation(
        id,
        session.user,
        await teamBody(request),
        invitationId,
      ),
    );
  } catch (error) {
    return teamFailure(error);
  }
}
export async function DELETE(request: Request, { params }: Context) {
  try {
    const session = await auth();
    if (!session?.user?.id) throw new TeamError("请先登录", 401);
    const { id, invitationId } = await params;
    return teamSuccess(
      await revokeInvitation(
        id,
        invitationId,
        session.user,
        await teamBody(request),
      ),
    );
  } catch (error) {
    return teamFailure(error);
  }
}
