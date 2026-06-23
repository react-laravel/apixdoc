import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useProjectPage } from "@/hooks/useProjectPage";

const mockProject = {
  id: "proj-1",
  name: "Test Project",
  description: "A test project",
  baseUrl: "https://api.test.com",
  isPublic: false,
  environments: [],
  globalHeaders: [],
  globalParams: [],
  folders: [],
  endpoints: [
    {
      id: "ep-1",
      name: "Test Endpoint",
      method: "GET",
      path: "/api/test",
      description: "Test endpoint",
      folderId: null,
    },
  ],
};

describe("useProjectPage", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("returns initial loading state", () => {
    global.fetch = vi.fn(() =>
      Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ success: true, data: mockProject }),
      } as Response),
    ) as unknown as typeof fetch;

    const { result } = renderHook(() => useProjectPage());
    expect(result.current.loading).toBe(true);
  });

  it("loads project data", async () => {
    global.fetch = vi.fn(() =>
      Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ success: true, data: mockProject }),
      } as Response),
    ) as unknown as typeof fetch;

    const { result } = renderHook(() => useProjectPage());

    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 50));
    });

    expect(result.current.project).not.toBeNull();
    expect(result.current.project?.name).toBe("Test Project");
    expect(result.current.loading).toBe(false);
  });

  it("collects endpoints from folders and root", async () => {
    const projectWithFolders = {
      ...mockProject,
      folders: [
        {
          id: "f1",
          name: "Users",
          endpoints: [
            {
              id: "ep-2",
              name: "Get User",
              method: "GET",
              path: "/api/users/:id",
              description: "",
              folderId: "f1",
            },
          ],
        },
      ],
    };

    global.fetch = vi.fn(() =>
      Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ success: true, data: projectWithFolders }),
      } as Response),
    ) as unknown as typeof fetch;

    const { result } = renderHook(() => useProjectPage());

    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 50));
    });

    expect(result.current.allEndpoints.length).toBe(2);
    expect(result.current.allEndpoints.map((e) => e.id)).toContain("ep-1");
    expect(result.current.allEndpoints.map((e) => e.id)).toContain("ep-2");
  });

  it("selects an endpoint", async () => {
    global.fetch = vi.fn(() =>
      Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ success: true, data: mockProject }),
      } as Response),
    ) as unknown as typeof fetch;

    const { result } = renderHook(() => useProjectPage());

    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 50));
    });

    act(() => {
      result.current.handleSelectEndpoint("ep-1");
    });

    expect(result.current.selectedEndpointId).toBe("ep-1");
    expect(result.current.selectedEndpoint?.id).toBe("ep-1");
  });

  it("returns null when project not found", async () => {
    global.fetch = vi.fn(() =>
      Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ success: true, data: null }),
      } as Response),
    ) as unknown as typeof fetch;

    const { result } = renderHook(() => useProjectPage());

    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 50));
    });

    expect(result.current.project).toBeNull();
    expect(result.current.loading).toBe(false);
  });

  it("creates a folder successfully", async () => {
    const newFolder = { id: "f-new", name: "New Folder" };
    global.fetch = vi.fn((url: string, options?: RequestInit) => {
      if (url === "/api/folders" && options?.method === "POST") {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ success: true, data: newFolder }),
        } as Response);
      }
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ success: true, data: mockProject }),
      } as Response);
    }) as unknown as typeof fetch;

    const { result } = renderHook(() => useProjectPage());

    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 50));
    });

    let error: string | null = "init";
    await act(async () => {
      error = await result.current.handleCreateFolder("New Folder");
    });

    expect(error).toBeNull();
    expect(result.current.project?.folders).toContainEqual(newFolder);
  });

  it("rejects duplicate folder names", async () => {
    const projectWithFolder = {
      ...mockProject,
      folders: [{ id: "f1", name: "Existing" }],
    };

    global.fetch = vi.fn(() =>
      Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ success: true, data: projectWithFolder }),
      } as Response),
    ) as unknown as typeof fetch;

    const { result } = renderHook(() => useProjectPage());

    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 50));
    });

    const error = await result.current.handleCreateFolder("existing");
    expect(error).toBe("文件夹名称不能重复");
  });

  it("creates an endpoint successfully", async () => {
    const newEndpoint = {
      id: "ep-new",
      name: "New EP",
      method: "POST",
      path: "/api/new",
      description: "",
      folderId: null,
    };

    global.fetch = vi.fn((url: string, options?: RequestInit) => {
      if (url === "/api/endpoints" && options?.method === "POST") {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ success: true, data: newEndpoint }),
        } as Response);
      }
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ success: true, data: mockProject }),
      } as Response);
    }) as unknown as typeof fetch;

    const { result } = renderHook(() => useProjectPage());

    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 50));
    });

    const response = await result.current.handleCreateEndpoint({
      name: "New EP",
      method: "POST",
      path: "/api/new",
      description: "",
      folderId: null,
    });

    expect(response.error).toBeUndefined();
    // Verify state was updated
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    const ids = result.current.project?.endpoints.map((e) => e.id) ?? [];
    expect(ids).toContain("ep-new");
  });

  it("returns error for empty path on create endpoint", async () => {
    global.fetch = vi.fn(() =>
      Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ success: true, data: mockProject }),
      } as Response),
    ) as unknown as typeof fetch;

    const { result } = renderHook(() => useProjectPage());

    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 50));
    });

    const response = await result.current.handleCreateEndpoint({
      name: "Test",
      method: "GET",
      path: "   ",
      description: "",
      folderId: null,
    });

    expect(response.error).toBe("请填写接口路径");
  });

  it("saves endpoint basic info without error", async () => {
    global.fetch = vi.fn((url: string, options?: RequestInit) => {
      if (options?.method === "PUT" && typeof url === "string" && url.includes("/endpoints/")) {
        return Promise.resolve({
          ok: true,
          json: () =>
            Promise.resolve({
              success: true,
              data: { id: "ep-1", name: "Updated Name" },
            }),
        } as Response);
      }
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ success: true, data: mockProject }),
      } as Response);
    }) as unknown as typeof fetch;

    const { result } = renderHook(() => useProjectPage());

    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 50));
    });

    await act(async () => {
      result.current.handleSelectEndpoint("ep-1");
      await result.current.handleSaveEndpoint({
        id: "ep-1",
        name: "Updated Name",
        method: "GET",
        path: "/api/test",
        description: "Test endpoint",
      });
    });

    expect(result.current.saveError).toBeNull();
  });

  it("sets saveError when API returns failure", async () => {
    global.fetch = vi.fn((url: string, options?: RequestInit) => {
      if (options?.method === "PUT" && typeof url === "string" && url.includes("/endpoints/")) {
        return Promise.resolve({
          ok: true,
          json: () =>
            Promise.resolve({
              success: false,
              error: "Save failed",
            }),
        } as Response);
      }
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ success: true, data: mockProject }),
      } as Response);
    }) as unknown as typeof fetch;

    const { result } = renderHook(() => useProjectPage());

    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 50));
    });

    await act(async () => {
      result.current.handleSelectEndpoint("ep-1");
    });

    await act(async () => {
      await result.current.handleSaveEndpoint({
        id: "ep-1",
        name: "Updated",
      });
    });

    // React 19 concurrent mode needs a flush for the catch-block state update
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 10));
    });

    expect(result.current.saveError).toBe("Save failed");
  });

  it("clears save error on endpoint selection", async () => {
    global.fetch = vi.fn(() =>
      Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ success: true, data: mockProject }),
      } as Response),
    ) as unknown as typeof fetch;

    const { result } = renderHook(() => useProjectPage());

    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 50));
    });

    act(() => {
      result.current.setSaveError("Test error");
    });
    expect(result.current.saveError).toBe("Test error");

    act(() => {
      result.current.handleSelectEndpoint("ep-1");
    });
    expect(result.current.saveError).toBeNull();
  });

  it("saves endpoint parameters", async () => {
    global.fetch = vi.fn((url: string, options?: RequestInit) => {
      if (options?.method === "POST" && url === "/api/endpoints/ep-1/params") {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ success: true, data: [{ name: "id", type: "string", required: true, location: "path", description: "", example: "" }] }),
        } as Response);
      }
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ success: true, data: mockProject }),
      } as Response);
    }) as unknown as typeof fetch;

    const { result } = renderHook(() => useProjectPage());

    await act(async () => { await new Promise((r) => setTimeout(r, 50)); });

    act(() => { result.current.handleSelectEndpoint("ep-1"); });

    await act(async () => {
      await result.current.handleSaveEndpoint({
        id: "ep-1",
        parameters: [{ name: "id", type: "string", required: true, location: "path", description: "", example: "" }],
      });
    });

    await act(async () => { await new Promise((r) => setTimeout(r, 10)); });
    expect(result.current.saveError).toBeNull();
  });

  it("saves endpoint request body", async () => {
    global.fetch = vi.fn((url: string, options?: RequestInit) => {
      if (options?.method === "POST" && url === "/api/endpoints/ep-1/body") {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ success: true, data: { contentType: "application/json", schema: "{}", example: "{}" } }),
        } as Response);
      }
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ success: true, data: mockProject }),
      } as Response);
    }) as unknown as typeof fetch;

    const { result } = renderHook(() => useProjectPage());

    await act(async () => { await new Promise((r) => setTimeout(r, 50)); });

    act(() => { result.current.handleSelectEndpoint("ep-1"); });

    await act(async () => {
      await result.current.handleSaveEndpoint({
        id: "ep-1",
        requestBody: { contentType: "application/json", schema: "{}", example: "{}" },
      });
    });

    await act(async () => { await new Promise((r) => setTimeout(r, 10)); });
    expect(result.current.saveError).toBeNull();
  });

  it("saves endpoint responses", async () => {
    global.fetch = vi.fn((url: string, options?: RequestInit) => {
      if (options?.method === "POST" && url === "/api/endpoints/ep-1/responses") {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ success: true, data: [{ statusCode: 200, description: "OK", contentType: "application/json", example: "{}" }] }),
        } as Response);
      }
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ success: true, data: mockProject }),
      } as Response);
    }) as unknown as typeof fetch;

    const { result } = renderHook(() => useProjectPage());

    await act(async () => { await new Promise((r) => setTimeout(r, 50)); });

    act(() => { result.current.handleSelectEndpoint("ep-1"); });

    await act(async () => {
      await result.current.handleSaveEndpoint({
        id: "ep-1",
        responses: [{ statusCode: 200, description: "OK", contentType: "application/json", example: "{}" }],
      });
    });

    await act(async () => { await new Promise((r) => setTimeout(r, 10)); });
    expect(result.current.saveError).toBeNull();
  });

  it("saves project settings", async () => {
    global.fetch = vi.fn((url: string, options?: RequestInit) => {
      if (options?.method === "PUT" && url === "/api/projects/proj-1") {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ success: true, data: { id: "proj-1", name: "Updated Project" } }),
        } as Response);
      }
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ success: true, data: mockProject }),
      } as Response);
    }) as unknown as typeof fetch;

    const { result } = renderHook(() => useProjectPage());

    await act(async () => { await new Promise((r) => setTimeout(r, 50)); });

    await act(async () => {
      await result.current.handleSaveSettings({ name: "Updated Project" });
    });

    await act(async () => { await new Promise((r) => setTimeout(r, 10)); });
    expect(result.current.project?.name).toBe("Updated Project");
  });

  it("reorders folders and endpoints", async () => {
    global.fetch = vi.fn((url: string, options?: RequestInit) => {
      if (options?.method === "POST" && url === "/api/projects/proj-1/reorder") {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ success: true }),
        } as Response);
      }
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ success: true, data: mockProject }),
      } as Response);
    }) as unknown as typeof fetch;

    const { result } = renderHook(() => useProjectPage());

    await act(async () => { await new Promise((r) => setTimeout(r, 50)); });

    await act(async () => {
      await result.current.handleReorder([{ id: "f1", order: 0 }], [{ id: "ep-1", order: 0 }]);
    });

    await act(async () => { await new Promise((r) => setTimeout(r, 10)); });
    // Should refetch project after reorder
    expect(result.current.project).not.toBeNull();
  });

  it("renames a folder", async () => {
    const projectWithFolder = {
      ...mockProject,
      folders: [{ id: "f1", name: "Old Name", parentId: null }],
    };

    global.fetch = vi.fn((url: string, options?: RequestInit) => {
      if (options?.method === "PUT" && url === "/api/folders/f1") {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ success: true }),
        } as Response);
      }
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ success: true, data: projectWithFolder }),
      } as Response);
    }) as unknown as typeof fetch;

    const { result } = renderHook(() => useProjectPage());

    await act(async () => { await new Promise((r) => setTimeout(r, 50)); });

    // Verify initial state
    expect(result.current.project?.folders[0].name).toBe("Old Name");

    await act(async () => {
      await result.current.handleRenameFolder("f1", "New Name");
    });

    await act(async () => { await new Promise((r) => setTimeout(r, 10)); });
    // Optimistic update should rename the folder
    const folder = result.current.project?.folders.find((f) => f.id === "f1");
    expect(folder?.name).toBe("New Name");
  });

  it("deletes a folder and calls fetchProject", async () => {
    // Re-mock confirm since beforeEach restores it
    const confirmMock = vi.fn(() => true);
    vi.stubGlobal("confirm", confirmMock);

    const projectWithFolder = {
      ...mockProject,
      folders: [{ id: "f1", name: "ToDelete", parentId: null }],
      endpoints: [
        ...mockProject.endpoints,
        { id: "ep-2", name: "In Folder", method: "GET", path: "/api/in", description: "", folderId: "f1" },
      ],
    };

    global.fetch = vi.fn((url: string, options?: RequestInit) => {
      if (options?.method === "DELETE" && url === "/api/folders/f1") {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ success: true }),
        } as Response);
      }
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ success: true, data: projectWithFolder }),
      } as Response);
    }) as unknown as typeof fetch;

    const { result } = renderHook(() => useProjectPage());

    await act(async () => { await new Promise((r) => setTimeout(r, 50)); });

    // Verify DELETE API is called and confirm was triggered
    await act(async () => {
      await result.current.handleDeleteFolder("f1");
    });

    expect(confirmMock).toHaveBeenCalledWith("确定要删除此文件夹吗？子文件夹也会被删除。");

    // Verify DELETE request was made
    const fetchCalls = (global.fetch as ReturnType<typeof vi.fn>).mock.calls;
    const deleteCall = fetchCalls.find(
      (c: unknown[]) => c[0] === "/api/folders/f1" && c[1]?.method === "DELETE",
    );
    expect(deleteCall).toBeDefined();
  });
});
