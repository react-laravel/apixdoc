import { describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ProjectSettings } from "./project-settings";
import { ApiError } from "@/lib/api-fetch";
import type { Project } from "@/lib/types";
import type { CodeEditorProps } from "@/components/json/code-editor";
vi.mock("@/components/json/code-editor", () => ({
  CodeEditor: ({ value, onChange, label, readOnly }: CodeEditorProps) => (
    <textarea
      aria-label={label}
      value={value}
      readOnly={readOnly}
      onChange={(e) => onChange?.(e.target.value)}
    />
  ),
}));
const project: Project = {
  id: "p",
  settingsVersion: 1,
  name: "Before",
  description: "old",
  baseUrl: "",
  isPublic: false,
  environments: [],
  globalHeaders: [],
  globalParams: [],
  endpoints: [],
  folders: [],
};
describe("project settings concurrency", () => {
  it("keeps a failed save in the form and never submits visibility for ordinary editors", async () => {
    const save = vi.fn().mockRejectedValue(new Error("Network failed")),
      close = vi.fn();
    render(
      <ProjectSettings
        project={project}
        onSave={save}
        open
        onOpenChange={close}
        canPublish={false}
      />,
    );
    fireEvent.change(screen.getByRole("textbox", { name: "项目描述" }), {
      target: { value: "mine" },
    });
    await userEvent.click(screen.getByRole("button", { name: "保存设置" }));
    await screen.findByRole("alert");
    expect(save.mock.calls[0][1]).toBe(1);
    expect(save.mock.calls[0][0].isPublic).toBeUndefined();
    expect(screen.getByRole("textbox", { name: "项目描述" })).toHaveValue(
      "mine",
    );
    expect(close).not.toHaveBeenCalled();
  });
  it("shows one conflict dialog and saves the chosen value against the reviewed version", async () => {
    const save = vi
      .fn()
      .mockRejectedValueOnce(
        new ApiError("Conflict", 409, "PROJECT_SETTINGS_CONFLICT", {
          section: "basic",
          label: "项目设置",
          version: 2,
          baseAvailable: true,
          conflicts: [
            { path: "/name", base: "Before", mine: "Mine", current: "Theirs" },
          ],
          proposed: {
            ...project,
            name: "Theirs",
            description: "Remote description",
          },
        }),
      )
      .mockResolvedValueOnce({ ...project, settingsVersion: 3, name: "Mine" });
    const close = vi.fn();
    render(
      <ProjectSettings
        project={project}
        onSave={save}
        open
        onOpenChange={close}
      />,
    );
    fireEvent.change(screen.getByRole("textbox", { name: "项目名称" }), {
      target: { value: "Mine" },
    });
    await userEvent.click(screen.getByRole("button", { name: "保存设置" }));
    await screen.findByRole("heading", { name: "项目设置有冲突" });
    expect(screen.getAllByRole("dialog")).toHaveLength(1);
    await userEvent.click(screen.getByLabelText("保留我的修改"));
    await userEvent.click(screen.getByRole("button", { name: "合并并保存" }));
    await waitFor(() => expect(close).toHaveBeenCalledWith(false));
    expect(save.mock.calls[1][1]).toBe(2);
    expect(save.mock.calls[1][0]).toMatchObject({
      name: "Mine",
      description: "Remote description",
    });
  });
});
