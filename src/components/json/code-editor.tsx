"use client";

import { useEffect, useRef } from "react";
import { isolateHistory } from "@codemirror/commands";
import { basicSetup } from "codemirror";
import { Annotation, Compartment, EditorState } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import { json } from "@codemirror/lang-json";
import { HighlightStyle, syntaxHighlighting } from "@codemirror/language";
import { tags } from "@lezer/highlight";
import { linter } from "@codemirror/lint";
import { inspectJson } from "@/lib/json-document";

export interface CodeEditorProps {
  value: string;
  onChange?: (value: string) => void;
  label: string;
  language?: "json" | "text";
  readOnly?: boolean;
  wrap?: boolean;
  focusOffset?: { offset: number; request: number };
}

const externalChange = Annotation.define<boolean>();

const theme = EditorView.theme({
  "&": {
    backgroundColor: "var(--json-bg)",
    color: "var(--json-fg)",
    fontSize: "12px",
  },
  "&.cm-focused": { outline: "none" },
  ".cm-scroller": {
    fontFamily: "var(--font-geist-mono), ui-monospace, monospace",
    overflow: "auto",
    minHeight: "200px",
    maxHeight: "420px",
  },
  ".cm-content": { padding: "12px 0", caretColor: "var(--json-fg)" },
  ".cm-line": { padding: "0 12px" },
  ".cm-gutters": {
    backgroundColor: "var(--json-bg)",
    color: "var(--json-muted)",
    border: "none",
    paddingLeft: "4px",
  },
  ".cm-activeLine, .cm-activeLineGutter": {
    backgroundColor: "var(--json-active)",
  },
  ".cm-selectionBackground, &.cm-focused .cm-selectionBackground": {
    backgroundColor: "var(--json-selection)",
  },
  ".cm-cursor": { borderLeftColor: "var(--json-fg)" },
  ".cm-panels, .cm-tooltip": {
    backgroundColor: "var(--json-bg)",
    color: "var(--json-fg)",
    borderColor: "var(--json-border)",
  },
  ".cm-search": {
    padding: "8px",
    display: "flex",
    flexWrap: "wrap",
    gap: "6px",
  },
  ".cm-textfield, .cm-button": {
    background: "var(--json-active)",
    color: "var(--json-fg)",
    border: "1px solid var(--json-border)",
    borderRadius: "4px",
  },
});
const highlight = syntaxHighlighting(
  HighlightStyle.define([
    { tag: tags.propertyName, color: "var(--json-key)" },
    { tag: tags.string, color: "var(--json-string)" },
    { tag: tags.number, color: "var(--json-number)" },
    { tag: [tags.bool, tags.null], color: "var(--json-literal)" },
  ]),
);

export function CodeEditor({
  value,
  onChange,
  label,
  language = "json",
  readOnly = false,
  wrap = true,
  focusOffset,
}: CodeEditorProps) {
  const container = useRef<HTMLDivElement>(null);
  const view = useRef<EditorView | null>(null);
  const callback = useRef(onChange);
  const initialValue = useRef(value);
  const options = useRef(new Compartment());
  useEffect(() => {
    callback.current = onChange;
  }, [onChange]);

  useEffect(() => {
    if (!container.current) return;
    const editor = new EditorView({
      parent: container.current,
      state: EditorState.create({
        doc: initialValue.current,
        extensions: [
          basicSetup,
          theme,
          highlight,
          options.current.of([]),
          EditorView.updateListener.of((update) => {
            if (
              update.docChanged &&
              !update.transactions.every((transaction) =>
                transaction.annotation(externalChange),
              )
            )
              callback.current?.(update.state.doc.toString());
          }),
        ],
      }),
    });
    view.current = editor;
    return () => {
      view.current = null;
      editor.destroy();
    };
  }, []);

  useEffect(() => {
    view.current?.dispatch({
      effects: options.current.reconfigure([
        EditorState.readOnly.of(readOnly),
        EditorView.editable.of(!readOnly),
        EditorView.contentAttributes.of({
          "aria-label": label,
          "aria-readonly": String(readOnly),
          role: "textbox",
          "aria-multiline": "true",
          tabindex: "0",
        }),
        ...(wrap ? [EditorView.lineWrapping] : []),
        ...(language === "json"
          ? [
              json(),
              linter(
                (editor) => {
                  const issue = inspectJson(editor.state.doc.toString()).issue;
                  return issue
                    ? [
                        {
                          from: issue.offset,
                          to: Math.min(
                            editor.state.doc.length,
                            issue.offset + issue.length,
                          ),
                          severity: "error" as const,
                          message: issue.message,
                        },
                      ]
                    : [];
                },
                { delay: 400 },
              ),
            ]
          : []),
      ]),
    });
  }, [label, language, readOnly, wrap]);

  useEffect(() => {
    const editor = view.current;
    if (!editor || editor.state.doc.toString() === value) return;
    editor.dispatch({
      changes: { from: 0, to: editor.state.doc.length, insert: value },
      annotations: [externalChange.of(true), isolateHistory.of("full")],
    });
  }, [value]);

  useEffect(() => {
    if (!focusOffset || !view.current) return;
    const offset = Math.min(focusOffset.offset, view.current.state.doc.length);
    view.current.dispatch({
      selection: { anchor: offset },
      effects: EditorView.scrollIntoView(offset, { y: "center" }),
    });
    view.current.focus();
  }, [focusOffset]);

  return <div ref={container} className="json-code min-w-0" />;
}
