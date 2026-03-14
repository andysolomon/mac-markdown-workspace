import React, { useCallback } from "react";
import { useInstance } from "@milkdown/react";
import { commandsCtx } from "@milkdown/core";
import {
  toggleStrongCommand,
  toggleEmphasisCommand,
  toggleInlineCodeCommand,
  toggleLinkCommand,
  wrapInHeadingCommand,
  wrapInBulletListCommand,
  wrapInOrderedListCommand,
  wrapInBlockquoteCommand,
  createCodeBlockCommand,
  insertHrCommand,
} from "@milkdown/preset-commonmark";

interface ToolbarButton {
  label: string;
  title: string;
  action: () => void;
}

export function WysiwygToolbar() {
  const [loading, getEditor] = useInstance();

  const call = useCallback(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (cmd: any, payload?: any) => {
      if (loading) return;
      const editor = getEditor();
      editor.action((ctx) => {
        const commands = ctx.get(commandsCtx);
        commands.call(cmd.key ?? cmd, payload);
      });
    },
    [loading, getEditor],
  );

  const buttons: ToolbarButton[] = [
    { label: "H", title: "Heading", action: () => call(wrapInHeadingCommand, 2) },
    { label: "B", title: "Bold", action: () => call(toggleStrongCommand) },
    { label: "I", title: "Italic", action: () => call(toggleEmphasisCommand) },
    { label: "<>", title: "Inline Code", action: () => call(toggleInlineCodeCommand) },
    { label: "\u{1F517}", title: "Link", action: () => call(toggleLinkCommand, { href: "" }) },
    { label: "\u2014", title: "Horizontal Rule", action: () => call(insertHrCommand) },
    { label: "\u{1F4CB}", title: "Code Block", action: () => call(createCodeBlockCommand) },
    { label: "\u275D", title: "Blockquote", action: () => call(wrapInBlockquoteCommand) },
    { label: "\u2022", title: "Bullet List", action: () => call(wrapInBulletListCommand) },
    { label: "1.", title: "Ordered List", action: () => call(wrapInOrderedListCommand) },
  ];

  return (
    <div className="wysiwyg-toolbar">
      {buttons.map((btn) => (
        <button
          key={btn.title}
          title={btn.title}
          onMouseDown={(e) => {
            e.preventDefault(); // keep editor focus
            btn.action();
          }}
        >
          {btn.label}
        </button>
      ))}
    </div>
  );
}
