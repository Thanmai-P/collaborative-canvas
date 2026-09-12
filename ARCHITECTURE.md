# Architecture

## 1. High-level data flow

```text
Browser A
  |
  | Socket.io: stroke-start / stroke-point / stroke-end
  v
Node.js + Socket.io Server
  |
  | broadcasts events to the room
  v
Browser B
  |
  | drawStroke()
  v
HTML5 Canvas
```

Cursors use a separate DOM overlay so cursor movement does not require repainting the canvas.

## 2. Client state

```text
committedStrokes[]
    |
    +-- authoritative completed operations

remoteActiveStrokes
    |
    +-- strokes currently being drawn by another user

currentStroke
    |
    +-- local stroke currently being drawn

users
    |
    +-- online users and assigned colors
```

## 3. WebSocket protocol

| Event | Direction | Purpose |
|---|---|---|
| `join-room` | client -> server | Join a drawing room |
| `room-state` | server -> client | Initial operations + users |
| `user-joined` | server -> room | Announce a new user |
| `user-left` | server -> room | Remove a user |
| `cursor-move` | client -> room | Live cursor position |
| `stroke-start` | client -> room | Begin a live stroke |
| `stroke-point` | client -> room | Send one new point |
| `stroke-end` | client -> server | Commit complete stroke |
| `stroke-commit` | server -> room | Authoritative committed operation |
| `undo` | client -> server | Remove latest global operation |
| `redo` | client -> server | Restore latest undone operation |
| `history-state` | server -> room | Authoritative operation list after undo/redo |

## 4. Undo/redo strategy

The server is authoritative.

Each room contains:

```text
operations[]
redoStack[]
```

When a stroke ends:

```text
operations.push(stroke)
redoStack.clear()
```

Undo:

```text
operations.pop()
redoStack.push(operation)
broadcast operations
```

Redo:

```text
redoStack.pop()
operations.push(operation)
broadcast operations
```

Because every client redraws from the same authoritative ordered operation list, all clients converge to the same canvas state.

## 5. Conflict resolution

Simultaneous drawing operations are allowed to render live.

When a stroke finishes, the server appends it to the room's operation log. The server therefore creates a deterministic commit order.

For overlapping strokes, later committed operations are rendered after earlier operations. Eraser operations use Canvas `destination-out`, so their position in the ordered operation log determines what they erase.

This is a simple last-committed-operation ordering strategy. It avoids trying to merge pixel data between clients.

## 6. Performance decisions

- Drawing is represented as points rather than canvas screenshots.
- Canvas rendering is done with native Canvas 2D APIs.
- Remote cursors are DOM elements in an overlay instead of being painted into the canvas.
- Live points are sent individually for responsiveness.
- A production-scale version should batch/throttle pointer points and use a more optimized render pipeline.
- The server limits stroke point count and coordinate ranges.

## 7. Error/edge handling

- Missing canvas/context causes a clear startup error.
- Invalid server strokes are rejected.
- Stroke IDs prevent duplicate committed operations.
- Users are removed on disconnect.
- Empty undo/redo operations are ignored.
- Room names and display names are sanitized.
