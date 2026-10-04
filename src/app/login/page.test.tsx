import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { signIn, type SignInResponse } from "next-auth/react";
import LoginPage from "./page";

vi.mock("next-auth/react", () => ({ signIn: vi.fn() }));
beforeEach(() => { vi.mocked(signIn).mockReset(); });

function fillForm() {
  fireEvent.change(screen.getByLabelText("邮箱"), { target: { value: "user@example.test" } });
  fireEvent.change(screen.getByLabelText("密码"), { target: { value: "password" } });
  return screen.getByRole("button", { name: /^登录$/ }).closest("form")!;
}

describe("login submission", () => {
  it("prevents duplicate pending authentication and re-enables the form for retry", async () => {
    let finish!: (value: SignInResponse) => void;
    vi.mocked(signIn).mockImplementation(() => new Promise((resolve) => { finish = resolve; }));
    render(<LoginPage />);
    const form = fillForm();
    fireEvent.submit(form);
    fireEvent.submit(form);
    expect(signIn).toHaveBeenCalledTimes(1);
    expect(screen.getByLabelText("邮箱")).toBeDisabled();
    expect(form).toHaveAttribute("aria-busy", "true");
    await act(async () => finish({ error: "CredentialsSignin", code: undefined, ok: false, status: 401, url: null }));
    expect(await screen.findByRole("alert")).toHaveTextContent("邮箱或密码错误");
    expect(screen.getByLabelText("密码")).toBeEnabled();
    expect(screen.getByLabelText("密码")).toHaveValue("password");
    vi.mocked(signIn).mockRejectedValue(new Error("offline"));
    fireEvent.submit(form);
    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("检查网络"));
    expect(signIn).toHaveBeenCalledTimes(2);
  });
  it("does not navigate when authentication provides no successful result", async () => {
    vi.mocked(signIn).mockResolvedValue({ error: undefined, code: undefined, ok: false, status: 401, url: null });
    render(<LoginPage />);
    fireEvent.submit(fillForm());
    expect(await screen.findByRole("alert")).toHaveTextContent("邮箱或密码错误");
    expect(screen.getByRole("button", { name: /^登录$/ })).toBeEnabled();
  });
});
