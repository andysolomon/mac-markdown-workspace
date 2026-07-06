import React from "react";

export function EditorChrome({
  onToggleList,
  onFontClick,
  onNewNote,
  onSettingsClick,
}: {
  onToggleList: () => void;
  onFontClick: () => void;
  onNewNote: () => void;
  onSettingsClick: () => void;
}) {
  return (
    <div className="mm-topbar">
      <button
        type="button"
        className="mm-listicon"
        aria-label="Toggle list"
        onClick={onToggleList}
      >
        <div className="r">
          <span />
          <span />
        </div>
        <div className="r">
          <span />
          <span />
        </div>
        <div className="r">
          <span />
          <span />
        </div>
      </button>
      <button type="button" className="mm-aa" onClick={onFontClick}>
        Aa
      </button>
      <button
        type="button"
        className="mm-plus"
        aria-label="New note"
        onClick={onNewNote}
      >
        +
      </button>
      <button
        type="button"
        className="mm-more"
        aria-label="Settings"
        onClick={onSettingsClick}
      >
        ⋯
      </button>
    </div>
  );
}
