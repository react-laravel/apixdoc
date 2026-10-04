"use client";

import { useEffect, useRef, type RefObject } from "react";
import { isolateHistory } from "@codemirror/commands";
import { basicSetup } from "codemirror";
import { Annotation, Compartment, EditorState } from "@codemirror/state";
import {
  EditorView,
  Decoration,
  MatchDecorator,
  ViewPlugin,
  type DecorationSet,
  type ViewUpdate,
} from "@codemirror/view";
import { json } from "@codemirror/lang-json";
import { HighlightStyle, syntaxHighlighting } from "@codemirror/language";
import { tags } from "@lezer/highlight";
import { linter } from "@codemirror/lint";
import { inspectJson, inspectJsonTemplate } from "@/lib/json-document";

export interface CodeEditorProps {
  value: string;
  onChange?: (value: string) => void;
  label: string;
  language?: "json" | "text";
  readOnly?: boolean;
  template?: boolean;
  wrap?: boolean;
  focusOffset?: { offset: number; request: number };
  sessionRef?: RefObject<CodeEditorSession | null>;
}

export interface CodeEditorSession {
  state: EditorState | null;
  options: Compartment;
  onChange?: (value: string) => void;
  focusRequest?: CodeEditorProps["focusOffset"];
}

const externalChange = Annotation.define<boolean>();

const templateMatcher = new MatchDecorator({
  regexp: /\{\{[^{}]+\}\}/g,
  decoration: Decoration.mark({ class: "cm-template-variable" }),
});
const templateHighlight = ViewPlugin.fromClass(
  class {
    decorations: DecorationSet;
    constructor(view: EditorView) {
      this.decorations = templateMatcher.createDeco(view);
    }
    update(update: ViewUpdate) {
      this.decorations = templateMatcher.updateDeco(update, this.decorations);
    }
  },
  { decorations: (plugin) => plugin.decorations },
);

const theme = EditorView.theme({
  ".cm-template-variable": {
    color: "var(--json-key)",
    backgroundColor: "var(--json-selection)",
    borderRadius: "3px",
  },
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
  template = false,
  wrap = true,
  focusOffset,
  sessionRef,
}: CodeEditorProps) {
  const container = useRef<HTMLDivElement>(null);
  const view = useRef<EditorView | null>(null);
  const callback = useRef(onChange);
  const initialValue = useRef(value);
  const activeSession = useRef<CodeEditorSession | null>(null);
  useEffect(() => {
    callback.current = onChange;
    if (activeSession.current) activeSession.current = { ...activeSession.current, onChange };
    if (sessionRef?.current) sessionRef.current = { ...sessionRef.current, onChange };
  }, [onChange, sessionRef]);

  useEffect(() => {
    if (!container.current) return;
    const stored = sessionRef?.current;
    const session: CodeEditorSession = {
      state: stored?.state ?? null,
      options: stored?.options ?? new Compartment(),
      onChange: callback.current,
      focusRequest: stored?.focusRequest,
    };
    activeSession.current = session;
    if (sessionRef) sessionRef.current = session;
    const editor = new EditorView({
      parent: container.current,
      state: session.state ?? EditorState.create({
        doc: initialValue.current,
        extensions: [
          basicSetup,
          theme,
          highlight,
          session.options.of([]),
          EditorView.updateListener.of((update) => {
            if (
              update.docChanged &&
              !update.transactions.every((transaction) =>
                transaction.annotation(externalChange),
              )
            )
              (sessionRef ? sessionRef.current?.onChange : callback.current)?.(update.state.doc.toString());
          }),
        ],
      }),
    });
    view.current = editor;
    return () => {
      if (sessionRef) sessionRef.current = {
        ...(activeSession.current ?? session),
        state: editor.state,
        onChange: undefined,
      };
      activeSession.current = null;
      view.current = null;
      editor.destroy();
    };
  }, [sessionRef]);

  useEffect(() => {
    view.current?.dispatch({
      effects: activeSession.current!.options.reconfigure([
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
        ...(template ? [templateHighlight] : []),
        ...(language === "json"
          ? [
              json(),
              linter(
                (editor) => {
                  const issue = (template ? inspectJsonTemplate : inspectJson)(
                    editor.state.doc.toString(),
                  ).issue;
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
  }, [label, language, readOnly, wrap, template, sessionRef]);

  useEffect(() => {
    const editor = view.current;
    if (!editor || editor.state.doc.toString() === value) return;
    editor.dispatch({
      changes: { from: 0, to: editor.state.doc.length, insert: value },
      annotations: [externalChange.of(true), isolateHistory.of("full")],
    });
  }, [value, sessionRef]);

  useEffect(() => {
    if (!focusOffset || !view.current || !activeSession.current || activeSession.current.focusRequest === focusOffset) return;
    activeSession.current = { ...activeSession.current, focusRequest: focusOffset };
    const offset = Math.min(focusOffset.offset, view.current.state.doc.length);
    view.current.dispatch({
      selection: { anchor: offset },
      effects: EditorView.scrollIntoView(offset, { y: "center" }),
    });
    view.current.focus();
  }, [focusOffset, sessionRef]);

  return <div ref={container} className="json-code min-w-0" />;
}
