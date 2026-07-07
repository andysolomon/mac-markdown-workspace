import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Sidebar } from "./Sidebar";
import { DocList } from "./DocList";
import { EditorChrome } from "./EditorChrome";
import { FontPopover } from "./FontPopover";
import { SettingsPanel, OPEN_SYNC_EVENT } from "./SettingsPanel";
import { SyncModal } from "./SyncModal";
import { BottomBar } from "./BottomBar";
import { MarkdownAccessoryBar } from "./MarkdownAccessoryBar";
import { useSettingsStore } from "../../services/settingsStore";
import { Toolbar } from "../Toolbar";
import { Workspace } from "../Workspace";
import { StatusBar } from "../StatusBar";
import { useNotesStore } from "../../services/notesStore";
import { buildTagIndex, filterNotes } from "../../services/notesModel";
import { useDocumentStore } from "../../services/documentStore";
import { TOAST_EVENT } from "../../services/toast";

const AUTOSAVE_MS = 600;

function isNarrowQuery(): MediaQueryList {
  return window.matchMedia("(max-width: 640px)");
}

/**
 * NotesShell — the Bear-style three-pane workspace container. Wires the notes
 * library (sidebar tags, doc list, selection) to the existing editor stack.
 * documentStore remains the editing buffer: the active note is synced into it
 * on selection, and buffer changes are autosaved back (debounced).
 */
export function NotesShell() {
  const loadLibrary = useNotesStore((s) => s.loadLibrary);
  const activeNoteId = useNotesStore((s) => s.activeNoteId);
  const selectedTag = useNotesStore((s) => s.selectedTag);
  const searchQuery = useNotesStore((s) => s.searchQuery);
  const setSelectedTag = useNotesStore((s) => s.setSelectedTag);
  const setSearchQuery = useNotesStore((s) => s.setSearchQuery);
  const selectNote = useNotesStore((s) => s.selectNote);
  const createNote = useNotesStore((s) => s.createNote);
  // Subscribe to the raw slice and derive with useMemo — selectors that build
  // new arrays per call must not be passed to useNotesStore directly (the
  // fresh reference every snapshot would loop useSyncExternalStore).
  const notes = useNotesStore((s) => s.notes);
  const tags = useMemo(() => buildTagIndex(notes), [notes]);
  const filteredNotes = useMemo(
    () => filterNotes(notes, { tag: selectedTag, query: searchQuery }),
    [notes, selectedTag, searchQuery],
  );

  const content = useDocumentStore((s) => s.content);

  // Track the mobile breakpoint live — sampling width only at mount strands
  // the panes when the window is resized or macOS-zoom-restored across 640px
  // (issue #1 / W-000001).
  const [isNarrow, setIsNarrow] = useState(
    () => typeof window !== "undefined" && window.matchMedia("(max-width: 640px)").matches,
  );
  const [panelsOpen, setPanelsOpen] = useState(() => !isNarrowQuery().matches);
  // Bear-style page stack on narrow viewports: sidebar › list › editor
  // (issue #16 / W-000016). Desktop keeps the panelsOpen split layout.
  const [mobilePage, setMobilePage] = useState<"sidebar" | "list" | "editor">("list");
  const [fontOpen, setFontOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [syncModal, setSyncModal] = useState<{ open: boolean; auto: boolean }>({
    open: false,
    auto: false,
  });
  const [editorFocused, setEditorFocused] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const showToolbar = useSettingsStore((s) => s.showToolbar);

  // Cloud Sync modal opens from the settings section and the on-focus nudge.
  useEffect(() => {
    const onOpen = (e: Event) => {
      const auto = (e as CustomEvent<{ auto?: boolean }>).detail?.auto ?? false;
      // An auto nudge must never hijack a modal the user already has open.
      setSyncModal((prev) => (prev.open ? prev : { open: true, auto }));
    };
    window.addEventListener(OPEN_SYNC_EVENT, onOpen);
    return () => window.removeEventListener(OPEN_SYNC_EVENT, onOpen);
  }, []);

  // Quiet confirmation pill (export feedback etc.); auto-dismisses.
  useEffect(() => {
    let timer: number | null = null;
    const onToast = (e: Event) => {
      setToast((e as CustomEvent<string>).detail);
      if (timer) window.clearTimeout(timer);
      timer = window.setTimeout(() => setToast(null), 3000);
    };
    window.addEventListener(TOAST_EVENT, onToast);
    return () => {
      window.removeEventListener(TOAST_EVENT, onToast);
      if (timer) window.clearTimeout(timer);
    };
  }, []);

  // Track whether the CodeMirror editor owns focus (drives which mobile bar
  // shows: keyboard accessory while editing, bottom tool strip otherwise).
  // Blur is deferred a tick so accessory taps don't flicker the bars.
  useEffect(() => {
    let blurTimer: number | null = null;
    const isEditorTarget = (t: EventTarget | null) =>
      t instanceof Element && !!t.closest(".cm-content");
    const onFocusIn = (e: FocusEvent) => {
      if (isEditorTarget(e.target)) {
        if (blurTimer) window.clearTimeout(blurTimer);
        setEditorFocused(true);
      }
    };
    const onFocusOut = (e: FocusEvent) => {
      if (isEditorTarget(e.target)) {
        blurTimer = window.setTimeout(() => setEditorFocused(false), 120);
      }
    };
    document.addEventListener("focusin", onFocusIn);
    document.addEventListener("focusout", onFocusOut);
    return () => {
      document.removeEventListener("focusin", onFocusIn);
      document.removeEventListener("focusout", onFocusOut);
      if (blurTimer) window.clearTimeout(blurTimer);
    };
  }, []);

  useEffect(() => {
    const mq = isNarrowQuery();
    const onChange = (e: MediaQueryListEvent) => {
      setIsNarrow(e.matches);
      // Crossing the breakpoint resets to that layout's default: panels
      // restored when wide, the notes-list page when narrow.
      setPanelsOpen(!e.matches);
      if (e.matches) setMobilePage("list");
    };
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);
  const saveTimer = useRef<number | null>(null);

  useEffect(() => {
    loadLibrary();
  }, [loadLibrary]);

  // Selection changed: load the active note into the editing buffer.
  // filePath is cleared so file-save shortcuts can never write a note's
  // content over a previously opened file.
  useEffect(() => {
    if (!activeNoteId) return;
    const note = useNotesStore.getState().notes.find((n) => n.id === activeNoteId);
    if (!note) return;
    useDocumentStore.setState({
      content: note.body,
      savedContent: note.body,
      filePath: "",
    });
  }, [activeNoteId]);

  // Debounced autosave: editing buffer -> active note. The effect cleanup is
  // the debounce; a no-op when the buffer matches the stored body (e.g. right
  // after selection sync).
  useEffect(() => {
    const s = useNotesStore.getState();
    if (!s.loaded || !s.activeNoteId) return;
    const active = s.notes.find((n) => n.id === s.activeNoteId);
    if (!active || content === active.body) return;

    const timer = window.setTimeout(() => {
      saveTimer.current = null;
      useNotesStore
        .getState()
        .updateActiveNote(useDocumentStore.getState().content)
        .then(() => useDocumentStore.getState().markClean());
    }, AUTOSAVE_MS);
    saveTimer.current = timer;
    return () => {
      window.clearTimeout(timer);
      if (saveTimer.current === timer) saveTimer.current = null;
    };
  }, [content]);

  // Write any pending edit immediately (before switching notes).
  const flushPendingSave = useCallback(async () => {
    if (saveTimer.current === null) return;
    window.clearTimeout(saveTimer.current);
    saveTimer.current = null;
    const buffer = useDocumentStore.getState().content;
    const s = useNotesStore.getState();
    const active = s.notes.find((n) => n.id === s.activeNoteId);
    if (active && buffer !== active.body) {
      await s.updateActiveNote(buffer);
      useDocumentStore.getState().markClean();
    }
  }, []);

  const handleSelectNote = useCallback(
    async (id: string) => {
      await flushPendingSave();
      selectNote(id);
      if (isNarrow) {
        setMobilePage("editor");
      }
    },
    [flushPendingSave, selectNote, isNarrow],
  );

  const handleNewNote = useCallback(async () => {
    await flushPendingSave();
    await createNote("");
    if (isNarrowQuery().matches) setMobilePage("editor");
  }, [flushPendingSave, createNote]);

  const handleDeleteNote = useCallback(async (id: string) => {
    const note = useNotesStore.getState().notes.find((n) => n.id === id);
    const ok = window.confirm(`Delete "${note?.title ?? "this note"}"?`);
    if (!ok) return;
    await useNotesStore.getState().deleteNote(id);
  }, []);

  // Pane visibility: desktop = split panels (panelsOpen toggles both);
  // narrow = one full-screen page at a time (Bear-style stack, issue #16).
  const showSidebar = isNarrow ? mobilePage === "sidebar" : panelsOpen;
  const showList = isNarrow ? mobilePage === "list" : panelsOpen;
  const showEditor = isNarrow ? mobilePage === "editor" : true;

  return (
    <>
      {showSidebar && (
        <Sidebar
          tags={tags}
          selectedTag={selectedTag}
          onSelectTag={(tag) => {
            setSelectedTag(tag);
            if (isNarrow) setMobilePage("list");
          }}
        />
      )}
      {showList && (
        <DocList
          notes={filteredNotes}
          activeNoteId={activeNoteId}
          searchQuery={searchQuery}
          onSearchChange={setSearchQuery}
          onSelectNote={handleSelectNote}
          onDeleteNote={handleDeleteNote}
          header={
            isNarrow
              ? {
                  title: selectedTag ? `#${selectedTag}` : "All Notes",
                  onBack: () => setMobilePage("sidebar"),
                  onNew: handleNewNote,
                }
              : undefined
          }
        />
      )}
      {showEditor && (
        <section className="mm-editor">
          <EditorChrome
            onBack={() =>
              isNarrow ? setMobilePage("list") : setPanelsOpen(true)
            }
            onForward={() =>
              isNarrow ? setMobilePage("editor") : setPanelsOpen(false)
            }
            canBack={isNarrow ? mobilePage !== "sidebar" : !panelsOpen}
            canForward={isNarrow ? mobilePage !== "editor" : panelsOpen}
            onFontClick={() => setFontOpen((v) => !v)}
            onNewNote={handleNewNote}
            onSettingsClick={() => setSettingsOpen((v) => !v)}
          />
          <FontPopover open={fontOpen} onClose={() => setFontOpen(false)} />
          <SettingsPanel open={settingsOpen} onClose={() => setSettingsOpen(false)} />
          {showToolbar ? <Toolbar /> : null}
          <Workspace />
          <StatusBar />
          {isNarrow && !editorFocused ? (
            <BottomBar
              onBack={() => setMobilePage("list")}
              onFontClick={() => setFontOpen((v) => !v)}
              onNewNote={handleNewNote}
            />
          ) : null}
          {isNarrow && editorFocused ? <MarkdownAccessoryBar /> : null}
        </section>
      )}
      {toast ? <div className="mm-toast">{toast}</div> : null}
      <SyncModal
        open={syncModal.open}
        autoSync={syncModal.auto}
        onClose={() => setSyncModal({ open: false, auto: false })}
      />
    </>
  );
}
