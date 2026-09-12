import {
  accountActor,
  accountBody,
  accountFailure,
  accountSuccess,
} from "@/lib/accounts/http";
import { readAccount, changeProfile } from "@/lib/accounts/service";
export async function GET() {
  try {
    return accountSuccess(await readAccount(await accountActor()));
  } catch (error) {
    return accountFailure(error);
  }
}
export async function PATCH(request: Request) {
  try {
    return accountSuccess(
      await changeProfile(await accountActor(), await accountBody(request)),
    );
  } catch (error) {
    return accountFailure(error);
  }
}
