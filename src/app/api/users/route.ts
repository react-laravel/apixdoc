import {
  accountActor,
  accountBody,
  accountFailure,
  accountSuccess,
} from "@/lib/accounts/http";
import { listAccounts, createAccount } from "@/lib/accounts/service";
export async function GET(request: Request) {
  try {
    const actor = await accountActor(),
      q = new URL(request.url).searchParams;
    return accountSuccess(
      await listAccounts(actor, {
        q: q.get("q") || undefined,
        status: q.get("status") || undefined,
        cursor: q.get("cursor") || undefined,
      }),
    );
  } catch (error) {
    return accountFailure(error);
  }
}
export async function POST(request: Request) {
  try {
    return accountSuccess(
      await createAccount(await accountActor(), await accountBody(request)),
      201,
    );
  } catch (error) {
    return accountFailure(error);
  }
}
