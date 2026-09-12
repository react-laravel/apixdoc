import {
  accountBody,
  accountFailure,
  accountSuccess,
} from "@/lib/accounts/http";
import { recoverAccount } from "@/lib/accounts/service";
export async function POST(request: Request) {
  try {
    return accountSuccess(await recoverAccount(await accountBody(request)));
  } catch (error) {
    return accountFailure(error);
  }
}
