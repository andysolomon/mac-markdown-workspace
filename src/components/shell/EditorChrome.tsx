import React from "react";

export function EditorChrome({
  onBack,
  onForward,
  canBack,
  canForward,
  onFontClick,
  onNewNote,
  onSettingsClick,
}: {
  onBack: () => void;
  onForward: () => void;
  canBack: boolean;
  canForward: boolean;
  onFontClick: () => void;
  onNewNote: () => void;
  onSettingsClick: () => void;
}) {
  return (
    <div className="mm-topbar">
      <div className="mm-nav">
        <button
          type="button"
          className="mm-nav-btn"
          aria-label="Back"
          onClick={onBack}
          disabled={!canBack}
        >
          ‹
        </button>
        <button
          type="button"
          className="mm-nav-btn"
          aria-label="Forward"
          onClick={onForward}
          disabled={!canForward}
        >
          ›
        </button>
      </div>
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
