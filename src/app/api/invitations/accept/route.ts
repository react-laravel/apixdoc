import { auth } from "@/lib/auth";
import { acceptInvitation } from "@/lib/team/service";
import { teamBody, teamFailure, teamSuccess } from "@/lib/team/errors";
export async function POST(request: Request) {
  try {
    const body = await teamBody(request);
    const session = await auth();
    return teamSuccess(await acceptInvitation(body.token, session?.user, body));
  } catch (error) {
    return teamFailure(error);
  }
}
