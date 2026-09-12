import {
  accountActor,
  accountBody,
  accountFailure,
  accountSuccess,
} from "@/lib/accounts/http";
import { manageAccount } from "@/lib/accounts/service";
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    return accountSuccess(
      await manageAccount(
        await accountActor(),
        (await params).id,
        await accountBody(request),
      ),
    );
  } catch (error) {
    return accountFailure(error);
  }
}
export async function DELETE(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    return accountSuccess(
      await manageAccount(await accountActor(), (await context.params).id, {
        ...(await accountBody(request)),
        action: "delete",
      }),
    );
  } catch (error) {
    return accountFailure(error);
  }
}
