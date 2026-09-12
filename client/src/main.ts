import { io } from "socket.io-client";
import "../style.css";

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

type Cursor = {
    userId: string;
    name: string;
    color: string;
    point: Point;
};

const canvas = document.getElementById("canvas");
const colorPicker = document.getElementById("colorPicker") as HTMLInputElement | null;
const widthRange = document.getElementById("widthRange") as HTMLInputElement | null;
const widthValue = document.getElementById("widthValue");
const brushButton = document.getElementById("brushButton");
const eraserButton = document.getElementById("eraserButton");
const undoButton = document.getElementById("undoButton");
const redoButton = document.getElementById("redoButton");
const userNameInput = document.getElementById("userNameInput") as HTMLInputElement | null;
const roomInput = document.getElementById("roomInput") as HTMLInputElement | null;
const joinButton = document.getElementById("joinButton");
const roomLabel = document.getElementById("roomLabel");
const userList = document.getElementById("userList");
const statusLabel = document.getElementById("status");
const onlineCount = document.getElementById("onlineCount");
const cursorLayer = document.getElementById("cursorLayer");

if (!(canvas instanceof HTMLCanvasElement)) {
    throw new Error("Canvas element not found");
}

if (
    !colorPicker ||
    !widthRange ||
    !widthValue ||
    !brushButton ||
    !eraserButton ||
    !undoButton ||
    !redoButton ||
    !userNameInput ||
    !roomInput ||
    !joinButton ||
    !roomLabel ||
    !userList ||
    !statusLabel ||
    !onlineCount ||
    !cursorLayer
) {
    throw new Error("Required UI element not found");
}

const context = canvas.getContext("2d");

if (!context) {
    throw new Error("Could not get 2D canvas context");
}

const ctx: CanvasRenderingContext2D = context;

canvas.width = 1000;
canvas.height = 650;

let selectedTool: Tool = "brush";
let isDrawing = false;
let currentStroke: Stroke | null = null;
let currentRoom = "main";

const committedStrokes: Stroke[] = [];
const remoteActiveStrokes = new Map<string, Stroke>();
const users = new Map<string, User>();

const socketUrl = import.meta.env.DEV
    ? "http://localhost:3000"
    : window.location.origin;

const socket = io(socketUrl);

function drawStroke(stroke: Stroke): void {
    if (stroke.points.length === 0) {
        return;
    }

    ctx.save();

    ctx.lineWidth = stroke.width;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.strokeStyle = stroke.color;
    ctx.globalCompositeOperation =
        stroke.tool === "eraser" ? "destination-out" : "source-over";

    const firstPoint = stroke.points[0];

    if (stroke.points.length === 1) {
        ctx.beginPath();
        ctx.arc(
            firstPoint.x,
            firstPoint.y,
            Math.max(stroke.width / 2, 1),
            0,
            Math.PI * 2
        );
        ctx.fill();
        ctx.restore();
        return;
    }

    ctx.beginPath();
    ctx.moveTo(firstPoint.x, firstPoint.y);

    for (let i = 1; i < stroke.points.length; i += 1) {
        const point = stroke.points[i];
        ctx.lineTo(point.x, point.y);
    }

    ctx.stroke();
    ctx.restore();
}

function renderAll(): void {
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    for (const stroke of committedStrokes) {
        drawStroke(stroke);
    }

    for (const stroke of remoteActiveStrokes.values()) {
        drawStroke(stroke);
    }

    if (currentStroke) {
        drawStroke(currentStroke);
    }
}

function getPoint(event: PointerEvent): Point {
    const rect = canvas.getBoundingClientRect();

    return {
        x: (event.clientX - rect.left) * (canvas.width / rect.width),
        y: (event.clientY - rect.top) * (canvas.height / rect.height)
    };
}

function updateToolButtons(): void {
    brushButton.classList.toggle("active", selectedTool === "brush");
    eraserButton.classList.toggle("active", selectedTool === "eraser");
}

function renderUsers(): void {
    userList.innerHTML = "";

    for (const user of users.values()) {
        const item = document.createElement("li");

        const dot = document.createElement("span");
        dot.className = "user-dot";
        dot.style.backgroundColor = user.color;

        const name = document.createElement("span");
        name.textContent =
            user.id === socket.id ? `${user.name} (you)` : user.name;

        item.append(dot, name);
        userList.appendChild(item);
    }

    onlineCount.textContent = `${users.size} online`;
}

function updateCursor(
    userId: string,
    name: string,
    color: string,
    point: Point
): void {
    let element = document.getElementById(`cursor-${userId}`);

    if (!element) {
        element = document.createElement("div");
        element.id = `cursor-${userId}`;
        element.className = "remote-cursor";
        cursorLayer.appendChild(element);
    }

    const rect = canvas.getBoundingClientRect();
    const scaleX = rect.width / canvas.width;
    const scaleY = rect.height / canvas.height;

    element.style.left = `${point.x * scaleX}px`;
    element.style.top = `${point.y * scaleY}px`;
    element.style.setProperty("--cursor-color", color);
    element.textContent = name;
}

function removeCursor(userId: string): void {
    document.getElementById(`cursor-${userId}`)?.remove();
}

function joinRoom(): void {
    const requestedRoom =
        roomInput.value.trim().replace(/\s+/g, "-").slice(0, 30) || "main";

    const name =
        userNameInput.value.trim().slice(0, 20) || "Guest";

    roomInput.value = requestedRoom;
    userNameInput.value = name;

    socket.emit("join-room", {
        roomId: requestedRoom,
        name
    });
}

brushButton.addEventListener("click", () => {
    selectedTool = "brush";
    updateToolButtons();
});

eraserButton.addEventListener("click", () => {
    selectedTool = "eraser";
    updateToolButtons();
});

widthRange.addEventListener("input", () => {
    widthValue.textContent = `${widthRange.value}px`;
});

undoButton.addEventListener("click", () => {
    socket.emit("undo");
});

redoButton.addEventListener("click", () => {
    socket.emit("redo");
});

joinButton.addEventListener("click", joinRoom);

canvas.addEventListener("pointerdown", (event) => {
    if (event.button !== 0 && event.pointerType === "mouse") {
        return;
    }

    event.preventDefault();
    canvas.setPointerCapture(event.pointerId);

    isDrawing = true;

    currentStroke = {
        id: crypto.randomUUID(),
        color: colorPicker.value,
        width: Number(widthRange.value),
        tool: selectedTool,
        points: [getPoint(event)]
    };

    socket.emit("stroke-start", currentStroke);
    drawStroke(currentStroke);
});

canvas.addEventListener("pointermove", (event) => {
    const point = getPoint(event);

    if (isDrawing && currentStroke) {
        currentStroke.points.push(point);
        drawStroke(currentStroke);

        socket.emit("stroke-point", {
            strokeId: currentStroke.id,
            point
        });
    }

    if (socket.connected) {
        socket.emit("cursor-move", { point });
    }
});

function finishStroke(): void {
    if (!currentStroke) {
        return;
    }

    const finishedStroke = currentStroke;

    isDrawing = false;
    currentStroke = null;

    socket.emit("stroke-end", finishedStroke);
}

canvas.addEventListener("pointerup", finishStroke);
canvas.addEventListener("pointercancel", finishStroke);

socket.on("connect", () => {
    statusLabel.textContent = "Connected";
    joinRoom();
});

socket.on("disconnect", () => {
    statusLabel.textContent = "Disconnected";
});

socket.on(
    "room-state",
    (state: { roomId: string; operations: Stroke[]; users: User[] }) => {
        currentRoom = state.roomId;

        committedStrokes.length = 0;
        committedStrokes.push(...state.operations);

        remoteActiveStrokes.clear();
        cursorLayer.innerHTML = "";

        users.clear();

        for (const user of state.users) {
            users.set(user.id, user);
        }

        roomLabel.textContent = `Room: ${currentRoom}`;
        renderUsers();
        renderAll();
    }
);

socket.on("user-joined", (user: User) => {
    users.set(user.id, user);
    renderUsers();
});

socket.on("user-left", (userId: string) => {
    users.delete(userId);
    removeCursor(userId);
    renderUsers();
});

socket.on(
    "cursor-move",
    (cursor: {
        userId: string;
        name: string;
        color: string;
        point: Point;
    }) => {
        if (cursor.userId === socket.id) {
            return;
        }

        updateCursor(
            cursor.userId,
            cursor.name,
            cursor.color,
            cursor.point
        );
    }
);

socket.on("stroke-start", (stroke: Stroke) => {
    remoteActiveStrokes.set(stroke.id, stroke);
    drawStroke(stroke);
});

socket.on(
    "stroke-point",
    (data: { strokeId: string; point: Point }) => {
        const stroke = remoteActiveStrokes.get(data.strokeId);

        if (!stroke) {
            return;
        }

        stroke.points.push(data.point);
        drawStroke(stroke);
    }
);

socket.on("stroke-commit", (stroke: Stroke) => {
    remoteActiveStrokes.delete(stroke.id);

    const existingIndex = committedStrokes.findIndex(
        (item) => item.id === stroke.id
    );

    if (existingIndex === -1) {
        committedStrokes.push(stroke);
    } else {
        committedStrokes[existingIndex] = stroke;
    }

    renderAll();
});

socket.on("history-state", (operations: Stroke[]) => {
    committedStrokes.length = 0;
    committedStrokes.push(...operations);
    renderAll();
});

socket.on("error-message", (message: string) => {
    console.error(message);
    statusLabel.textContent = message;
});

updateToolButtons();
widthValue.textContent = `${widthRange.value}px`;
renderUsers();

const params = new URLSearchParams(window.location.search);
const roomFromUrl = params.get("room");

if (roomFromUrl) {
    roomInput.value = roomFromUrl;
}
