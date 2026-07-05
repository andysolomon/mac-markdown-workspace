import React from "react";
import type { TagCount } from "../../services/notesModel";
import { Tag } from "./Tag";
import { WindowDots } from "./WindowDots";

export function Sidebar({
  tags,
  selectedTag,
  onSelectTag,
}: {
  tags: TagCount[];
  selectedTag: string | null;
  onSelectTag: (tag: string | null) => void;
}) {
  return (
    <aside className="mm-sidebar">
      <div className="mm-dots-row">
        <WindowDots />
      </div>
      <div className="mm-scroll">
        <div
          className={`mm-all${selectedTag === null ? " sel" : ""}`}
          onClick={() => onSelectTag(null)}
        >
          All
        </div>
        <div className="mm-hashhead">HASHTAGS</div>
        {tags.map((t) => (
          <Tag
            key={t.tag}
            label={`#${t.tag}`}
            selected={t.tag === selectedTag}
            onClick={() => onSelectTag(t.tag)}
          />
        ))}
      </div>
    </aside>
  );
}
