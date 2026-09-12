export const ACCOUNT_STATUSES = {
  active: "正常",
  disabled: "已停用",
  deleted: "已删除",
} as const;
export type AccountStatus = keyof typeof ACCOUNT_STATUSES;
export interface Account {
  id: string;
  email: string;
  name: string;
  role: string;
  status: AccountStatus;
  accountVersion: number;
  createdAt: string;
  deletedAt: string | null;
  resetExpiresAt: string | null;
}
export type AccountAction =
  | "disable"
  | "enable"
  | "delete"
  | "restore"
  | "role"
  | "recovery"
  | "revoke-recovery";
