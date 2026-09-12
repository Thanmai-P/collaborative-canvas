import { createServer } from "node:http";
import { extname, join, resolve } from "node:path";
import { readFile } from "node:fs/promises";
import { Server } from "socket.io";

type Point = {
    x: number;
    y: number;
};

type Tool = "brush" | "eraser";

type Stroke = {
    id: string;
    color: string;
    width: number;
    tool: Tool;
    points: Point[];
};

type User = {
    id: string;
    name: string;
    color: string;
};

type RoomState = {
    operations: Stroke[];
    redoStack: Stroke[];
    users: Map<string, User>;
};

const PORT = Number(process.env.PORT ?? 3000);
const ALLOWED_ORIGIN = process.env.CLIENT_ORIGIN ?? "*";

const rooms = new Map<string, RoomState>();

const USER_COLORS = [
    "#ef4444",
    "#3b82f6",
    "#22c55e",
    "#f59e0b",
    "#8b5cf6",
    "#ec4899",
    "#14b8a6",
    "#f97316"
];

function getRoom(roomId: string): RoomState {
    let room = rooms.get(roomId);

    if (!room) {
        room = {
            operations: [],
            redoStack: [],
            users: new Map()
        };

        rooms.set(roomId, room);
    }

    return room;
}

function sanitizeRoomId(value: unknown): string {
    if (typeof value !== "string") {
        return "main";
    }

    const cleaned = value
        .trim()
        .replace(/[^a-zA-Z0-9_-]/g, "")
        .slice(0, 30);

    return cleaned || "main";
}

function sanitizeName(value: unknown): string {
    if (typeof value !== "string") {
        return "Guest";
    }

    return value.trim().slice(0, 20) || "Guest";
}

function chooseColor(room: RoomState): string {
    const used = new Set(
        Array.from(room.users.values()).map((user) => user.color)
    );

    return (
        USER_COLORS.find((color) => !used.has(color)) ??
        USER_COLORS[room.users.size % USER_COLORS.length]
    );
}

function validStroke(stroke: Stroke): boolean {
    if (!stroke || typeof stroke.id !== "string") {
        return false;
    }

    if (
        !Array.isArray(stroke.points) ||
        stroke.points.length === 0 ||
        stroke.points.length > 20000
    ) {
        return false;
    }

    if (stroke.tool !== "brush" && stroke.tool !== "eraser") {
        return false;
    }

    if (
        !Number.isFinite(stroke.width) ||
        stroke.width < 1 ||
        stroke.width > 100
    ) {
        return false;
    }

    return stroke.points.every(
        (point) =>
            Number.isFinite(point.x) &&
            Number.isFinite(point.y) &&
            point.x >= 0 &&
            point.x <= 1000 &&
            point.y >= 0 &&
            point.y <= 650
    );
}

function publicUsers(room: RoomState): User[] {
    return Array.from(room.users.values());
}

function emitHistory(roomId: string, room: RoomState): void {
    io.to(roomId).emit("history-state", room.operations);
}

function leaveRoom(socketId: string, roomId: string): void {
    const room = rooms.get(roomId);

    if (!room) {
        return;
    }

    room.users.delete(socketId);
    io.to(roomId).emit("user-left", socketId);

    // Keep the room's drawing history in memory even when everyone leaves.
    // It is cleared only when the server restarts.
}

const httpServer = createServer(async (request, response) => {
    if (!request.url) {
        response.writeHead(400);
        response.end("Bad request");
        return;
    }

    const url = new URL(
        request.url,
        `http://${request.headers.host ?? "localhost"}`
    );

    if (url.pathname.startsWith("/socket.io/")) {
        return;
    }

    if (request.method !== "GET" && request.method !== "HEAD") {
        response.writeHead(405);
        response.end("Method not allowed");
        return;
    }

    const distRoot = resolve(process.cwd(), "dist");

    try {
        let requestedPath = decodeURIComponent(url.pathname);

        if (requestedPath === "/") {
            requestedPath = "/index.html";
        }

        const filePath = resolve(distRoot, `.${requestedPath}`);

        if (!filePath.startsWith(distRoot)) {
            response.writeHead(403);
            response.end("Forbidden");
            return;
        }

        let finalPath = filePath;

        try {
            await readFile(finalPath);
        } catch {
            finalPath = join(distRoot, "index.html");
        }

        const data = await readFile(finalPath);

        const mimeTypes: Record<string, string> = {
            ".html": "text/html; charset=utf-8",
            ".js": "text/javascript; charset=utf-8",
            ".css": "text/css; charset=utf-8",
            ".json": "application/json; charset=utf-8",
            ".svg": "image/svg+xml",
            ".png": "image/png",
            ".jpg": "image/jpeg",
            ".jpeg": "image/jpeg",
            ".ico": "image/x-icon"
        };

        response.writeHead(200, {
            "Content-Type":
                mimeTypes[extname(finalPath)] ?? "application/octet-stream"
        });

        if (request.method === "HEAD") {
            response.end();
        } else {
            response.end(data);
        }
    } catch (error) {
        console.error(error);
        response.writeHead(500);
        response.end("Server error");
    }
});

const io = new Server(httpServer, {
    cors: {
        origin: ALLOWED_ORIGIN
    }
});

io.on("connection", (socket) => {
    let currentRoomId = "main";

    function joinRoom(roomId: string, name: string): void {
        if (socket.rooms.has(roomId)) {
            return;
        }

        if (currentRoomId !== "main" && socket.rooms.has(currentRoomId)) {
            socket.leave(currentRoomId);
            leaveRoom(socket.id, currentRoomId);
        }

        currentRoomId = roomId;

        const room = getRoom(roomId);

        const user: User = {
            id: socket.id,
            name,
            color: chooseColor(room)
        };

        room.users.set(socket.id, user);
        socket.join(roomId);

        socket.emit("room-state", {
            roomId,
            operations: room.operations,
            users: publicUsers(room)
        });

        socket.to(roomId).emit("user-joined", user);

        console.log(`${name} joined room "${roomId}"`);
    }

    socket.on(
        "join-room",
        (data: { roomId?: unknown; name?: unknown }) => {
            joinRoom(
                sanitizeRoomId(data?.roomId),
                sanitizeName(data?.name)
            );
        }
    );

    socket.on("cursor-move", (data: { point?: Point }) => {
        if (!data?.point) {
            return;
        }

        const room = getRoom(currentRoomId);
        const user = room.users.get(socket.id);

        if (!user) {
            return;
        }

        socket.to(currentRoomId).emit("cursor-move", {
            userId: socket.id,
            name: user.name,
            color: user.color,
            point: data.point
        });
    });

    socket.on("stroke-start", (stroke: Stroke) => {
        if (!validStroke(stroke)) {
            return;
        }

        socket.to(currentRoomId).emit("stroke-start", stroke);
    });

    socket.on(
        "stroke-point",
        (data: { strokeId?: string; point?: Point }) => {
            if (
                typeof data?.strokeId !== "string" ||
                !data.point ||
                !Number.isFinite(data.point.x) ||
                !Number.isFinite(data.point.y)
            ) {
                return;
            }

            socket.to(currentRoomId).emit("stroke-point", {
                strokeId: data.strokeId,
                point: data.point
            });
        }
    );

    socket.on("stroke-end", (stroke: Stroke) => {
        if (!validStroke(stroke)) {
            return;
        }

        const room = getRoom(currentRoomId);

        const duplicate = room.operations.some(
            (operation) => operation.id === stroke.id
        );

        if (duplicate) {
            return;
        }

        room.operations.push(stroke);
        room.redoStack.length = 0;

        io.to(currentRoomId).emit("stroke-commit", stroke);
    });

    socket.on("undo", () => {
        const room = getRoom(currentRoomId);
        const operation = room.operations.pop();

        if (!operation) {
            return;
        }

        room.redoStack.push(operation);
        emitHistory(currentRoomId, room);
    });

    socket.on("redo", () => {
        const room = getRoom(currentRoomId);
        const operation = room.redoStack.pop();

        if (!operation) {
            return;
        }

        room.operations.push(operation);
        emitHistory(currentRoomId, room);
    });

    socket.on("disconnect", () => {
        leaveRoom(socket.id, currentRoomId);
        console.log(`Disconnected: ${socket.id}`);
    });
});

httpServer.listen(PORT, "0.0.0.0", () => {
        console.log(`Collaborative canvas server running on port ${PORT}`);
});
