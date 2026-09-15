import React from "react";
import type { TagCount } from "../../services/notesModel";
import { platformFromOs } from "../../services/hostPlatform";
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
  const showDots =
    window.appApi?.platform?.showWindowDots ?? platformFromOs("web").showWindowDots;

  return (
    <aside className="mm-sidebar">
      {showDots ? (
        <div className="mm-dots-row">
          <WindowDots />
        </div>
      ) : null}
      <div className="mm-scroll">
        <div
          className={`mm-all${selectedTag === null ? " sel" : ""}`}
          onClick={() => onSelectTag(null)}
        >
          <span>All</span>
          <span className="mm-chevron" aria-hidden="true">
            ›
          </span>
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
