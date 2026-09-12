import {
  accountActor,
  accountBody,
  accountFailure,
  accountSuccess,
} from "@/lib/accounts/http";
import { changeSecurity } from "@/lib/accounts/service";
export async function POST(request: Request) {
  try {
    return accountSuccess(
      await changeSecurity(await accountActor(), await accountBody(request)),
    );
  } catch (error) {
    return accountFailure(error);
  }
}
