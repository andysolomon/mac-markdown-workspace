# Desktop save recovery

Electron flushes the editor's pending and in-flight note saves before a window
close or application quit. A failed write keeps the window open and offers
retry or explicit discard.

Note files and the tombstone sidecar are written to a temporary file in the
same directory, flushed, and atomically renamed into place. If the process is
interrupted during replacement, the previous complete note remains readable;
a temporary artifact is ignored and cleaned up on the next failed write.

Forced termination (`SIGKILL`, power loss, or an OS crash) cannot recover text
that was still inside the renderer's debounce window or a write that had not
reached durable storage. Normal close and quit paths wait for the persistence
handshake, but no application-level mechanism can guarantee recovery after a
forced process termination.
