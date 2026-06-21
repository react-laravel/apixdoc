"use client";

import { useState, useRef, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { MethodBadge } from "@/components/method-badge";
import { cn } from "@/lib/utils";
import {
  ChevronDown,
  ChevronRight,
  ChevronsUpDown,
  Folder,
  FolderPlus,
  FilePlus,
  GripVertical,
  MoreHorizontal,
  Plus,
  Search,
  Trash2,
  X,
  Pencil,
  FoldVertical,
  UnfoldVertical,
} from "lucide-react";

interface Endpoint {
  id: string;
  name: string;
  method: string;
  path: string;
  folderId: string | null;
}

interface FolderItem {
  id: string;
  name: string;
  parentId?: string | null;
}

type DragItem =
  | { type: "folder"; id: string }
  | { type: "endpoint"; id: string };

type DropTarget =
  | { type: "folder"; id: string; position: "before" | "after" | "inside" }
  | { type: "endpoint"; id: string; position: "before" | "after" }
  | { type: "root" };

interface EndpointSidebarProps {
  folders: FolderItem[];
  endpoints: Endpoint[];
  selectedEndpointId: string | null;
  onSelectEndpoint: (id: string) => void;
  onCreateFolder: () => void;
  onCreateEndpoint: (folderId: string | null) => void;
  onDeleteFolder: (folderId: string) => void;
  onRenameFolder: (folderId: string, newName: string) => void;
  onReorder: (
    folders: Array<{ id: string; order: number; parentId?: string | null }>,
    endpoints: Array<{ id: string; order: number; folderId: string | null }>,
  ) => void;
}

export function EndpointSidebar({
  folders,
  endpoints,
  selectedEndpointId,
  onSelectEndpoint,
  onCreateFolder,
  onCreateEndpoint,
  onDeleteFolder,
  onRenameFolder,
  onReorder,
}: EndpointSidebarProps) {
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  const [allCollapsed, setAllCollapsed] = useState(false);
  const [dragItem, setDragItem] = useState<DragItem | null>(null);
  const [dropTarget, setDropTargetState] = useState<DropTarget | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const renameInputRef = useRef<HTMLInputElement | null>(null);

  // Use ref to avoid stale closure issues in drag event handlers
  const dropTargetRef = useRef<DropTarget | null>(null);
  const dragItemRef = useRef<DragItem | null>(null);
  const enterCounters = useRef<Map<string, number>>(new Map());

  const setDropTarget = useCallback((target: DropTarget | null) => {
    dropTargetRef.current = target;
    setDropTargetState(target);
  }, []);

  const toggleFolder = (folderId: string) => {
    setCollapsed((prev) => {
      const next = { ...prev, [folderId]: !prev[folderId] };
      // If any folder is expanded, mark allCollapsed as false
      const allCollapsedNow = folders.every((f) => next[f.id]);
      setAllCollapsed(allCollapsedNow);
      return next;
    });
  };

  const collapseAllFolders = () => {
    setAllCollapsed(true);
    setCollapsed(
      folders.reduce<Record<string, boolean>>((acc, folder) => {
        acc[folder.id] = true;
        return acc;
      }, {}),
    );
  };

  const expandAllFolders = () => {
    setAllCollapsed(false);
    setCollapsed({});
  };

  const toggleAllFolders = () => {
    if (allCollapsed) {
      expandAllFolders();
    } else {
      collapseAllFolders();
    }
  };

  const startRename = (folder: FolderItem) => {
    setRenamingId(folder.id);
    setRenameValue(folder.name);
    requestAnimationFrame(() => {
      renameInputRef.current?.select();
    });
  };

  const confirmRename = () => {
    if (renamingId && renameValue.trim()) {
      onRenameFolder(renamingId, renameValue.trim());
    }
    setRenamingId(null);
    setRenameValue("");
  };

  // Separate root-level folders and children
  const rootFolders = folders.filter((f) => !f.parentId);
  const getChildFolders = useCallback(
    (parentId: string) => folders.filter((f) => f.parentId === parentId),
    [folders],
  );
  const rootEndpoints = endpoints.filter((e) => !e.folderId);
  const getEndpointsInFolder = useCallback(
    (folderId: string) => endpoints.filter((e) => e.folderId === folderId),
    [endpoints],
  );
  const normalizedSearchQuery = searchQuery.trim().toLowerCase();
  const folderNameById = new Map(folders.map((folder) => [folder.id, folder.name]));
  const searchResults = normalizedSearchQuery
    ? endpoints.filter((endpoint) => {
        const folderName = endpoint.folderId
          ? (folderNameById.get(endpoint.folderId) ?? "")
          : "未分组";
        return [endpoint.name, endpoint.path, endpoint.method, folderName]
          .join(" ")
          .toLowerCase()
          .includes(normalizedSearchQuery);
      })
    : [];

  // --- Helpers ---

  const getDropPositionThirds = (
    e: React.DragEvent,
    el: HTMLElement,
  ): "before" | "after" | "inside" => {
    const rect = el.getBoundingClientRect();
    const y = e.clientY - rect.top;
    const q = rect.height / 4;
    if (y < q) return "before";
    if (y > q * 3) return "after";
    return "inside";
  };

  const getDropPositionHalf = (
    e: React.DragEvent,
    el: HTMLElement,
  ): "before" | "after" => {
    const rect = el.getBoundingClientRect();
    return e.clientY - rect.top < rect.height / 2 ? "before" : "after";
  };

  const matchDrop = (type: "folder" | "endpoint", id: string, pos?: string) => {
    if (!dropTarget || dropTarget.type !== type) return false;
    if (!("id" in dropTarget) || dropTarget.id !== id) return false;
    if (pos && dropTarget.position !== pos) return false;
    return true;
  };

  // Check if folderId is a descendant of ancestorId (prevent circular nesting)
  const isDescendant = (folderId: string, ancestorId: string): boolean => {
    const stack = getChildFolders(ancestorId).map((child) => child.id);

    while (stack.length > 0) {
      const currentId = stack.pop();
      if (!currentId) continue;
      if (currentId === folderId) return true;

      for (const child of getChildFolders(currentId)) {
        stack.push(child.id);
      }
    }

    return false;
  };

  // --- Drag start/end ---

  const handleDragStart = (e: React.DragEvent, item: DragItem) => {
    dragItemRef.current = item;
    setDragItem(item);
    e.dataTransfer.effectAllowed = "move";
    e.dataTransfer.setData("text/plain", "drag");
    requestAnimationFrame(() => {
      if (e.target instanceof HTMLElement) {
        e.target.style.opacity = "0.4";
      }
    });
  };

  const handleDragEnd = (e: React.DragEvent) => {
    if (e.target instanceof HTMLElement) {
      e.target.style.opacity = "";
      // Force cursor reset by briefly disabling pointer events
      e.target.style.cursor = "grab";
      requestAnimationFrame(() => {
        if (e.target instanceof HTMLElement) {
          e.target.style.cursor = "";
        }
      });
    }
    const currentDrag = dragItemRef.current;
    const currentDrop = dropTargetRef.current;
    if (currentDrag && currentDrop) {
      applyDrop(currentDrag, currentDrop);
    }
    dragItemRef.current = null;
    setDragItem(null);
    setDropTarget(null);
    enterCounters.current.clear();
  };

  // --- Folder drag zone handlers ---

  const handleFolderDragEnter = (e: React.DragEvent, folderId: string) => {
    e.preventDefault();
    e.stopPropagation();
    const key = `f-${folderId}`;
    enterCounters.current.set(key, (enterCounters.current.get(key) ?? 0) + 1);
  };

  const handleFolderDragOver = (e: React.DragEvent, folderId: string) => {
    e.preventDefault();
    e.stopPropagation();
    const drag = dragItemRef.current;
    if (!drag) return;
    // Can't drop on self
    if (drag.type === "folder" && drag.id === folderId) return;
    // Can't drop into own descendant
    if (drag.type === "folder" && isDescendant(folderId, drag.id)) return;

    if (drag.type === "endpoint") {
      setDropTarget({ type: "folder", id: folderId, position: "inside" });
    } else {
      const pos = getDropPositionThirds(e, e.currentTarget as HTMLElement);
      setDropTarget({ type: "folder", id: folderId, position: pos });
    }
  };

  const handleFolderDragLeave = (e: React.DragEvent, folderId: string) => {
    e.preventDefault();
    e.stopPropagation();
    const key = `f-${folderId}`;
    const count = (enterCounters.current.get(key) ?? 1) - 1;
    enterCounters.current.set(key, count);
    if (count <= 0) {
      enterCounters.current.delete(key);
      // Use ref to check if we should clear — avoids stale closure
      const current = dropTargetRef.current;
      if (
        current?.type === "folder" &&
        "id" in current &&
        current.id === folderId
      ) {
        setDropTarget(null);
      }
    }
  };

  // --- Endpoint drag zone handlers ---

  const handleEndpointDragEnter = (e: React.DragEvent, epId: string) => {
    e.preventDefault();
    e.stopPropagation();
    const key = `e-${epId}`;
    enterCounters.current.set(key, (enterCounters.current.get(key) ?? 0) + 1);
  };

  const handleEndpointDragOver = (e: React.DragEvent, epId: string) => {
    e.preventDefault();
    e.stopPropagation();
    const drag = dragItemRef.current;
    if (!drag || drag.type !== "endpoint" || drag.id === epId) return;
    const pos = getDropPositionHalf(e, e.currentTarget as HTMLElement);
    setDropTarget({ type: "endpoint", id: epId, position: pos });
  };

  const handleEndpointDragLeave = (e: React.DragEvent, epId: string) => {
    e.preventDefault();
    e.stopPropagation();
    const key = `e-${epId}`;
    const count = (enterCounters.current.get(key) ?? 1) - 1;
    enterCounters.current.set(key, count);
    if (count <= 0) {
      enterCounters.current.delete(key);
      const current = dropTargetRef.current;
      if (
        current?.type === "endpoint" &&
        "id" in current &&
        current.id === epId
      ) {
        setDropTarget(null);
      }
    }
  };

  // --- Apply the drop ---

  const applyDrop = (source: DragItem, target: DropTarget) => {
    if (source.type === "folder") {
      if (target.type === "folder" && target.id !== source.id) {
        if (target.position === "inside") {
          // Move source folder into target folder as child
          // Find siblings of the target folder's children, append at end
          const siblings = folders.filter(
            (f) => f.parentId === target.id && f.id !== source.id,
          );
          const folderUpdates = [
            ...siblings.map((f, i) => ({ id: f.id, order: i })),
            { id: source.id, order: siblings.length, parentId: target.id },
          ];
          onReorder(folderUpdates, []);
          // Auto-expand the target folder
          setCollapsed((prev) => ({ ...prev, [target.id]: false }));
        } else {
          // Reorder: move source before/after target at the same parent level
          const targetFolder = folders.find((f) => f.id === target.id);
          const parentId = targetFolder?.parentId ?? null;
          const siblings = folders.filter(
            (f) => f.parentId === parentId && f.id !== source.id,
          );
          const tgtIdx = siblings.findIndex((f) => f.id === target.id);
          if (tgtIdx === -1) return;
          const insertIdx = target.position === "before" ? tgtIdx : tgtIdx + 1;
          const sourceFolder = folders.find((f) => f.id === source.id);
          if (!sourceFolder) return;
          siblings.splice(insertIdx, 0, sourceFolder);
          onReorder(
            siblings.map((f, i) => ({
              id: f.id,
              order: i,
              parentId: parentId,
            })),
            [],
          );
        }
      } else if (target.type === "root") {
        // Move to root level
        const rootSiblings = folders.filter(
          (f) => !f.parentId && f.id !== source.id,
        );
        onReorder(
          [
            ...rootSiblings.map((f, i) => ({
              id: f.id,
              order: i,
              parentId: null,
            })),
            {
              id: source.id,
              order: rootSiblings.length,
              parentId: null,
            },
          ],
          [],
        );
      }
      return;
    }

    if (source.type === "endpoint") {
      const srcEp = endpoints.find((ep) => ep.id === source.id);
      if (!srcEp) return;

      let targetFolderId: string | null = srcEp.folderId;

      if (target.type === "folder") {
        targetFolderId = target.id;
      } else if (target.type === "endpoint") {
        const tgtEp = endpoints.find((ep) => ep.id === target.id);
        if (!tgtEp) return;
        targetFolderId = tgtEp.folderId;
      } else if (target.type === "root") {
        targetFolderId = null;
      }

      const group = endpoints
        .filter((ep) => ep.folderId === targetFolderId && ep.id !== source.id)
        .map((ep) => ({ ...ep }));

      const movedEp = { ...srcEp, folderId: targetFolderId };

      if (target.type === "endpoint") {
        const tgtIdx = group.findIndex((ep) => ep.id === target.id);
        if (tgtIdx !== -1) {
          const insertIdx = target.position === "before" ? tgtIdx : tgtIdx + 1;
          group.splice(insertIdx, 0, movedEp);
        } else {
          group.push(movedEp);
        }
      } else {
        group.push(movedEp);
      }

      onReorder(
        [],
        group.map((ep, i) => ({
          id: ep.id,
          order: i,
          folderId: targetFolderId,
        })),
      );
    }
  };

  // --- Styles ---

  const dropLineClass =
    "absolute left-2 right-2 h-0.5 bg-blue-500 rounded-full pointer-events-none z-10";

  const folderInsideHighlight =
    "ring-2 ring-blue-400 ring-inset bg-blue-50 dark:bg-blue-950/40";

  // --- Recursive folder renderer ---

  const renderFolder = (folder: FolderItem, depth: number = 0) => {
    const isCollapsed = collapsed[folder.id];
    const folderEndpoints = getEndpointsInFolder(folder.id);
    const childFolders = getChildFolders(folder.id);
    const isDraggingSelf =
      dragItem?.type === "folder" && dragItem.id === folder.id;
    const isInsideTarget = matchDrop("folder", folder.id, "inside");
    const isBeforeTarget = matchDrop("folder", folder.id, "before");
    const isAfterTarget = matchDrop("folder", folder.id, "after");

    return (
      <div
        key={folder.id}
        className={cn("relative", isDraggingSelf && "opacity-30")}
      >
        {isBeforeTarget && <div className={cn(dropLineClass, "top-0")} />}

        <div
          draggable
          onDragStart={(e) =>
            handleDragStart(e, { type: "folder", id: folder.id })
          }
          onDragEnd={handleDragEnd}
          onDragEnter={(e) => handleFolderDragEnter(e, folder.id)}
          onDragOver={(e) => handleFolderDragOver(e, folder.id)}
          onDragLeave={(e) => handleFolderDragLeave(e, folder.id)}
          className={cn(
            "flex w-full items-center gap-1 rounded py-2 text-sm cursor-grab active:cursor-grabbing transition-colors duration-75 sm:py-1.5",
            "hover:bg-zinc-100 dark:hover:bg-zinc-800",
            isInsideTarget && folderInsideHighlight,
          )}
          style={{ paddingLeft: `${depth * 16 + 4}px`, paddingRight: 4 }}
        >
          <GripVertical className="h-3 w-3 flex-shrink-0 text-zinc-300 dark:text-zinc-600" />
          <button
            onClick={() => toggleFolder(folder.id)}
            className="flex-shrink-0"
          >
            {isCollapsed ? (
              <ChevronRight className="h-3.5 w-3.5 text-zinc-400" />
            ) : (
              <ChevronDown className="h-3.5 w-3.5 text-zinc-400" />
            )}
          </button>
          <Folder className="h-3.5 w-3.5 flex-shrink-0 text-zinc-400" />
          {renamingId === folder.id ? (
            <input
              ref={renameInputRef}
              type="text"
              value={renameValue}
              onChange={(e) => setRenameValue(e.target.value)}
              onBlur={confirmRename}
              onKeyDown={(e) => {
                if (e.key === "Enter") confirmRename();
                if (e.key === "Escape") setRenamingId(null);
              }}
              className="flex-1 min-w-0 rounded border border-zinc-300 bg-white px-1.5 py-0.5 text-sm dark:border-zinc-600 dark:bg-zinc-800"
              onClick={(e) => e.stopPropagation()}
            />
          ) : (
            <span className="flex-1 truncate text-left">{folder.name}</span>
          )}
          <button
            onClick={(e) => {
              e.stopPropagation();
              onCreateEndpoint(folder.id);
            }}
            className="rounded p-0.5 hover:bg-zinc-200 dark:hover:bg-zinc-700"
            aria-label={`在 ${folder.name} 中创建接口`}
          >
            <Plus className="h-3.5 w-3.5 text-zinc-400" />
          </button>
          <details className="relative">
            <summary
              className="flex h-6 w-6 items-center justify-center rounded p-0 hover:bg-zinc-200 dark:hover:bg-zinc-700 [&::-webkit-details-marker]:hidden"
              onClick={(e) => e.stopPropagation()}
            >
              <MoreHorizontal className="h-3.5 w-3.5 text-zinc-400" />
            </summary>
            <div className="absolute right-0 top-[calc(100%+4px)] z-20 min-w-[140px] rounded-lg border border-zinc-200 bg-white py-1 shadow-md dark:border-zinc-700 dark:bg-zinc-800">
              <button
                type="button"
                className="flex w-full items-center gap-2 px-3 py-1.5 text-sm hover:bg-zinc-100 dark:hover:bg-zinc-700"
                onClick={(e) => {
                  e.stopPropagation();
                  startRename(folder);
                }}
              >
                <Pencil className="h-3.5 w-3.5 text-zinc-400" />
                重命名
              </button>
              <button
                type="button"
                className="flex w-full items-center gap-2 px-3 py-1.5 text-sm text-red-600 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-950/40"
                onClick={(e) => {
                  e.stopPropagation();
                  onDeleteFolder(folder.id);
                }}
              >
                <Trash2 className="h-3.5 w-3.5" />
                删除
              </button>
            </div>
          </details>
        </div>

        {!isCollapsed && (
          <div>
            {/* Child folders */}
            {childFolders.map((child) => renderFolder(child, depth + 1))}

            {/* Endpoints in this folder */}
            {folderEndpoints.map((ep) => (
              <EndpointRow
                key={ep.id}
                ep={ep}
                depth={depth + 1}
                isSelected={selectedEndpointId === ep.id}
                isDraggingThis={
                  dragItem?.type === "endpoint" && dragItem.id === ep.id
                }
                isDropBefore={matchDrop("endpoint", ep.id, "before")}
                isDropAfter={matchDrop("endpoint", ep.id, "after")}
                dropLineClass={dropLineClass}
                onSelect={() => onSelectEndpoint(ep.id)}
                onDragStart={(e) =>
                  handleDragStart(e, { type: "endpoint", id: ep.id })
                }
                onDragEnd={handleDragEnd}
                onDragEnter={(e) => handleEndpointDragEnter(e, ep.id)}
                onDragOver={(e) => handleEndpointDragOver(e, ep.id)}
                onDragLeave={(e) => handleEndpointDragLeave(e, ep.id)}
              />
            ))}

            {childFolders.length === 0 &&
              folderEndpoints.length === 0 &&
              !isInsideTarget && (
                <p
                  className="py-1 text-xs text-zinc-400"
                  style={{ paddingLeft: `${(depth + 1) * 16 + 8}px` }}
                >
                  暂无内容
                </p>
              )}
          </div>
        )}

        {isAfterTarget && <div className={cn(dropLineClass, "bottom-0")} />}
      </div>
    );
  };

  return (
    <div className="flex h-full flex-col bg-white md:border-r md:border-zinc-200 dark:bg-zinc-900 md:dark:border-zinc-800">
      <div className="flex items-center gap-2 border-b border-zinc-200 p-2 sm:p-3 dark:border-zinc-800">
        <Button
          variant="outline"
          size="icon"
          onClick={onCreateFolder}
          className="h-8 w-8 flex-shrink-0"
          aria-label="新建文件夹"
          title="新建文件夹"
        >
          <FolderPlus className="h-3.5 w-3.5" />
        </Button>
        <Button
          variant="outline"
          size="icon"
          onClick={() => onCreateEndpoint(null)}
          className="h-8 w-8 flex-shrink-0"
          aria-label="新建接口"
          title="新建接口"
        >
          <FilePlus className="h-3.5 w-3.5" />
        </Button>
        <Button
          variant="outline"
          size="icon"
          onClick={toggleAllFolders}
          className="h-8 w-8 flex-shrink-0"
          aria-label={allCollapsed ? "全部展开" : "全部收缩"}
          title={allCollapsed ? "全部展开" : "全部收缩"}
        >
          {allCollapsed ? (
            <UnfoldVertical className="h-3.5 w-3.5" />
          ) : (
            <FoldVertical className="h-3.5 w-3.5" />
          )}
        </Button>
        <div className="flex-1 min-w-0 relative">
          <Search className="pointer-events-none absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-zinc-400" />
          <Input
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="搜索接口..."
            className="h-8 pl-7 pr-8 text-xs"
          />
          {searchQuery && (
            <button
              type="button"
              onClick={() => setSearchQuery("")}
              className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-0.5 text-zinc-400 hover:bg-zinc-100 hover:text-zinc-600 dark:hover:bg-zinc-800"
              aria-label="清空搜索"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      </div>

      <div
        className="flex flex-1 flex-col overflow-y-auto overscroll-contain p-2"
        onDragOver={(e) => {
          e.preventDefault();
          e.dataTransfer.dropEffect = "move";
        }}
      >
        {normalizedSearchQuery ? (
          <div className="space-y-1">
            <p className="px-2 py-1 text-xs text-zinc-400">
              找到 {searchResults.length} 个接口
            </p>
            {searchResults.map((ep) => (
              <SearchResultRow
                key={ep.id}
                ep={ep}
                folderName={
                  ep.folderId ? (folderNameById.get(ep.folderId) ?? "") : "未分组"
                }
                isSelected={selectedEndpointId === ep.id}
                onSelect={() => onSelectEndpoint(ep.id)}
              />
            ))}
            {searchResults.length === 0 && (
              <p className="px-2 py-6 text-center text-sm text-zinc-400">
                没有匹配的接口
              </p>
            )}
          </div>
        ) : (
          <>
            {/* Root folders */}
            {rootFolders.map((folder) => renderFolder(folder, 0))}

            {/* Root-level endpoints */}
            {rootEndpoints.length > 0 && (
              <div className="mt-1">
                {rootFolders.length > 0 && (
                  <p className="px-2 py-1 text-xs font-medium text-zinc-400">
                    未分组
                  </p>
                )}
                {rootEndpoints.map((ep) => (
                  <EndpointRow
                    key={ep.id}
                    ep={ep}
                    depth={0}
                    isSelected={selectedEndpointId === ep.id}
                    isDraggingThis={
                      dragItem?.type === "endpoint" && dragItem.id === ep.id
                    }
                    isDropBefore={matchDrop("endpoint", ep.id, "before")}
                    isDropAfter={matchDrop("endpoint", ep.id, "after")}
                    dropLineClass={dropLineClass}
                    onSelect={() => onSelectEndpoint(ep.id)}
                    onDragStart={(e) =>
                      handleDragStart(e, { type: "endpoint", id: ep.id })
                    }
                    onDragEnd={handleDragEnd}
                    onDragEnter={(e) => handleEndpointDragEnter(e, ep.id)}
                    onDragOver={(e) => handleEndpointDragOver(e, ep.id)}
                    onDragLeave={(e) => handleEndpointDragLeave(e, ep.id)}
                  />
                ))}
              </div>
            )}
          </>
        )}

        {/* Drop zone: drag here to move to root level */}
        {!normalizedSearchQuery && (
        <div
          className={cn(
            "flex-1 min-h-[48px]",
            dropTarget?.type === "root" &&
              "bg-blue-50 dark:bg-blue-950/40 rounded border-2 border-dashed border-blue-300 dark:border-blue-700",
          )}
          onDragOver={(e) => {
            e.preventDefault();
            e.stopPropagation();
            setDropTarget({ type: "root" });
          }}
          onDragLeave={(e) => {
            e.preventDefault();
            if (e.currentTarget.contains(e.relatedTarget as Node)) return;
            const current = dropTargetRef.current;
            if (current?.type === "root") {
              setDropTarget(null);
            }
          }}
        />
        )}

        {!normalizedSearchQuery && rootFolders.length === 0 && rootEndpoints.length === 0 && (
          <p className="px-2 py-4 text-center text-sm text-zinc-400">
            暂无接口，点击上方按钮创建
          </p>
        )}
      </div>
    </div>
  );
}

function SearchResultRow({
  ep,
  folderName,
  isSelected,
  onSelect,
}: {
  ep: Endpoint;
  folderName: string;
  isSelected: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      className={cn(
        "flex w-full min-w-0 items-start gap-2 rounded px-2 py-2 text-left text-sm",
        isSelected
          ? "bg-zinc-100 dark:bg-zinc-800"
          : "hover:bg-zinc-50 dark:hover:bg-zinc-800/50",
      )}
    >
      <MethodBadge method={ep.method} />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-zinc-800 dark:text-zinc-200">
          {ep.name || ep.path}
        </span>
        <span className="mt-0.5 block truncate font-mono text-[11px] text-zinc-500">
          {ep.path}
        </span>
        <span className="mt-0.5 block truncate text-[11px] text-zinc-400">
          {folderName}
        </span>
      </span>
    </button>
  );
}

// --- Endpoint row ---

function EndpointRow({
  ep,
  depth,
  isSelected,
  isDraggingThis,
  isDropBefore,
  isDropAfter,
  dropLineClass,
  onSelect,
  onDragStart,
  onDragEnd,
  onDragEnter,
  onDragOver,
  onDragLeave,
}: {
  ep: Endpoint;
  depth: number;
  isSelected: boolean;
  isDraggingThis: boolean;
  isDropBefore: boolean;
  isDropAfter: boolean;
  dropLineClass: string;
  onSelect: () => void;
  onDragStart: (e: React.DragEvent) => void;
  onDragEnd: (e: React.DragEvent) => void;
  onDragEnter: (e: React.DragEvent) => void;
  onDragOver: (e: React.DragEvent) => void;
  onDragLeave: (e: React.DragEvent) => void;
}) {
  return (
    <div className={cn("relative", isDraggingThis && "opacity-30")}>
      {isDropBefore && <div className={cn(dropLineClass, "top-0")} />}
      <div
        draggable
        onDragStart={onDragStart}
        onDragEnd={onDragEnd}
        onDragEnter={onDragEnter}
        onDragOver={onDragOver}
        onDragLeave={onDragLeave}
        onClick={onSelect}
        className={cn(
          "flex w-full items-center gap-1 rounded py-2 text-sm cursor-grab active:cursor-grabbing sm:py-1.5",
          isSelected
            ? "bg-zinc-100 dark:bg-zinc-800"
            : "hover:bg-zinc-50 dark:hover:bg-zinc-800/50",
        )}
        style={{ paddingLeft: `${depth * 16 + 4}px`, paddingRight: 4 }}
      >
        <GripVertical className="h-3 w-3 flex-shrink-0 text-zinc-300 dark:text-zinc-600" />
        <MethodBadge method={ep.method} />
        <span className="flex-1 truncate text-left text-zinc-700 dark:text-zinc-300">
          {ep.name || ep.path}
        </span>
      </div>
      {isDropAfter && <div className={cn(dropLineClass, "bottom-0")} />}
    </div>
  );
}
