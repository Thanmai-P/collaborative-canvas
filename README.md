# Real-Time Collaborative Drawing Canvas

A real-time collaborative drawing application built with TypeScript, HTML5 Canvas, Node.js, and Socket.IO.

Multiple users can join the same room and draw together while seeing each other's cursor movements and drawing activity in real time.

## Features

- Vanilla TypeScript + HTML5 Canvas
- Node.js + Socket.io
- Brush and eraser
- Color and stroke width controls
- Live drawing synchronization while a stroke is in progress
- Remote user cursors
- Online users with assigned colors
- Rooms
- Global undo/redo controlled by the server
- Deterministic operation ordering for simultaneous strokes
- Touch/pointer support
- In-memory room state

## Run locally

From the project root:

```bash
npm install
npm install socket.io socket.io-client
npm install --save-dev tsx @types/node
```

Make sure `package.json` has these scripts:

```json
"scripts": {
  "dev": "vite",
  "server": "tsx server/server.ts",
  "build": "vite build",
  "start": "tsx server/server.ts"
}
```

Open two terminals.

Terminal 1:

```bash
npm run dev
```

Terminal 2:

```bash
npm run server
```

Open `http://localhost:5173`.

Open it in two browser tabs, use different names, and draw in one tab.

## Rooms

Enter a room name and click Join Room. Users in different rooms do not receive each other's drawing operations.

You can also use:

```text
http://localhost:5173/?room=demo
```

## Testing checklist

1. Open two browser tabs.
2. Give each tab a different name.
3. Confirm both users appear in Online Users.
4. Move the mouse in one tab and verify the other tab sees the named cursor.
5. Draw while holding the mouse down and verify the other tab sees the stroke before mouse release.
6. Test brush colors and widths.
7. Test eraser.
8. Click Undo in either tab and verify the latest global operation disappears in both tabs.
9. Click Redo and verify it returns in both tabs.
10. Join two different rooms and verify their canvases are isolated.
11. Refresh a tab and verify the room state is sent again while the server is still running.

## Known limitations

- Room state is stored only in server memory and is lost when the server restarts.
- No authentication.
- The server is intentionally single-process for this assignment.
- Every pointer movement is sent immediately; for very large rooms, production code should batch or throttle points.
- Undo/redo is global and follows server commit order, not per-user history.
- Deployment requires a Node/WebSocket-capable host for the backend.

## Suggested demo

Start with two browser windows side by side. Show:
1. Two online users.
2. Live cursor movement.
3. Live simultaneous drawing.
4. Different tools/colors.
5. Global undo/redo.
6. Room isolation.

## Time spent

- Project implementation: 10 hours
- Testing/debugging: 5 hours
- Documentation/deployment: 3 hours
- Total: 18 hours over 3 days
