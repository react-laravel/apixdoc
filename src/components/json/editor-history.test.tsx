import { useState } from "react";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { EditorView } from "@codemirror/view";
import { isolateHistory, undo, undoDepth } from "@codemirror/commands";
import { JsonWorkbench } from "./json-workbench";

function Harness() {
  const [value, setValue] = useState('{"id":1}');
  return <JsonWorkbench label="编辑历史" value={value} onChange={setValue} />;
}
function editor() {
  return EditorView.findFromDOM(screen.getByRole("textbox", { name: "编辑历史" }))!;
}
beforeEach(() => {
  // jsdom has no layout; these tests exercise real editor state and commands.
  vi.spyOn(window, "requestAnimationFrame").mockReturnValue(0);
});
describe("JSON editor history", () => {
  it.each(["structure", "expanded"])("preserves undo and selection after the %s view", (mode) => {
    render(<Harness />);
    act(() => editor().dispatch({
      changes: { from: 6, to: 7, insert: "2" },
      selection: { anchor: 7 },
      annotations: isolateHistory.of("full"),
    }));
    expect(undoDepth(editor().state)).toBe(1);
    if (mode === "structure") {
      fireEvent.click(screen.getByRole("button", { name: /^结构$/ }));
      fireEvent.click(screen.getByRole("button", { name: /^编辑$/ }));
    } else {
      fireEvent.click(screen.getByRole("button", { name: "放大编辑器" }));
      fireEvent.click(screen.getByRole("button", { name: "退出放大" }));
    }
    expect(editor().state.selection.main.anchor).toBe(7);
    expect(undoDepth(editor().state)).toBe(1);
    act(() => { expect(undo(editor())).toBe(true); });
    expect(editor().state.doc.toString()).toBe('{"id":1}');
  });
});
