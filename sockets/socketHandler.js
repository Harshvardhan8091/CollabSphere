"use strict";

const { Room } = require("../models");

/**
 * In-memory map: roomId -> Map<socketId, userId>
 */
const roomUsers = new Map();

/**
 * Optional in-memory store: roomId -> strokes[] (last N strokes, no DB persistence)
 */
const MAX_STROKES_PER_ROOM = 500;
const roomStrokes = new Map();

const broadcastParticipantCount = (io, roomId) => {
  const users = roomUsers.get(roomId);
  const count = users ? users.size : 0;
  io.to(roomId).emit("room-users-count", { roomId, count });
};

/**
 * Derive a unique, sorted array of userIds for a room and broadcast it.
 * Multiple sockets can belong to the same userId (e.g. duplicate tabs) —
 * we deduplicate with a Set so each userId appears once.
 */
const broadcastOnlineUsers = (io, roomId) => {
  const socketMap = roomUsers.get(roomId);
  if (!socketMap) {
    io.to(roomId).emit("online-users", []);
    return;
  }
  const unique = [...new Set(socketMap.values())].sort();
  io.to(roomId).emit("online-users", unique);
  console.log(`[Socket] online-users | roomId=${roomId} | users=[${unique.join(", ")}]`);
};

const registerSocketHandlers = (io) => {
  io.on("connection", (socket) => {
    console.log(`[Socket] User connected: ${socket.id}`);

    socket.on("join-room", async ({ roomId, userId } = {}) => {
      // Validate payload
      if (!roomId || !userId) {
        socket.emit("join-room-error", { message: "roomId and userId are required" });
        return;
      }

      console.log(`[Socket] join-room | roomId=${roomId} | userId=${userId} | socketId=${socket.id}`);

      // ── 1. Find or create Room document in MongoDB ────────────────────────
      let room;
      try {
        room = await Room.findOne({ roomId });
        if (!room) {
          room = new Room({ roomId, host: userId, participants: [], canvasData: [] });
          await room.save();
          console.log(`[Socket] Room created in DB | roomId=${roomId}`);
        } else {
          console.log(`[Socket] Room found in DB | roomId=${roomId} | strokes=${room.canvasData.length}`);
        }
      } catch (err) {
        console.error(`[Socket] Room find/create failed | roomId=${roomId} |`, err.message);
        socket.emit("join-room-error", { message: "Failed to initialise room" });
        return;
      }

      // ── Determine role ────────────────────────────────────────────────────
      // First user in this room's participants list becomes host, everyone else is editor.
      const alreadyIn = room.participants.find(p => p.userId === userId);
      let role;
      if (alreadyIn) {
        // Returning user — preserve existing role
        role = alreadyIn.role;
      } else if (room.participants.length === 0) {
        role = "host";
        room.participants.push({ userId, role });
        await room.save();
      } else {
        role = "editor";
        room.participants.push({ userId, role });
        await room.save();
      }
      console.log(`[Socket] Role assigned | userId=${userId} | role=${role} | roomId=${roomId}`);

      // ── 2. Join Socket.io room ────────────────────────────────────────────
      socket.join(roomId);

      // Track user in in-memory map
      if (!roomUsers.has(roomId)) {
        roomUsers.set(roomId, new Map());
      }
      roomUsers.get(roomId).set(socket.id, userId);

      // Store on socket for use in disconnect + permission checks
      socket.data.roomId = roomId;
      socket.data.userId = userId;
      socket.data.role = role;

      // Notify ONLY other users in the room (sender excluded)
      socket.to(roomId).emit("user-joined", { userId, roomId, role });

      // Broadcast updated participant count to EVERYONE in the room (including sender)
      broadcastParticipantCount(io, roomId);

      // Broadcast updated online user list to EVERYONE in the room
      broadcastOnlineUsers(io, roomId);

      // Acknowledge back to the joining socket only
      const count = roomUsers.get(roomId).size;
      socket.emit("joined-room", { roomId, userId, participantCount: count });

      // ── Emit role to joining socket ───────────────────────────────────────
      socket.emit("role-assigned", role);
      console.log(`[Socket] role-assigned emitted | userId=${userId} | role=${role}`);

      // ── 3. Send existing canvas strokes ONLY to the joining socket ────────
      socket.emit("load-canvas", room.canvasData ?? []);
      console.log(`[Socket] load-canvas | roomId=${roomId} | strokes=${room.canvasData?.length ?? 0}`);

      // ── 4. Send existing chat history ONLY to the joining socket ──────────
      socket.emit("load-chat", room.chatMessages ?? []);
      console.log(`[Socket] load-chat | roomId=${roomId} | messages=${room.chatMessages?.length ?? 0}`);
    });


    socket.on("clear-board", async ({ roomId } = {}) => {
      const userId = socket.data.userId;
      const role = socket.data.role;

      if (!roomId) return;

      // Permission check — only host can clear the board
      if (role !== "host") {
        socket.emit("clear-board-error", { message: "Only the host can clear the board" });
        console.warn(`[Socket] clear-board denied | userId=${userId} | role=${role} | roomId=${roomId}`);
        return;
      }

      try {
        const room = await Room.findOne({ roomId });
        if (!room) {
          socket.emit("clear-board-error", { message: "Room not found" });
          return;
        }

        // Clear persisted canvas + redo history
        room.canvasData = [];
        room.redoStack = [];
        await room.save();

        // Clear in-memory stroke cache
        roomStrokes.set(roomId, []);

        console.log(`[Socket] clear-board | roomId=${roomId} | clearedBy=${userId}`);

        // Broadcast blank canvas to everyone in the room
        io.to(roomId).emit("canvas-updated", []);
      } catch (err) {
        console.error(`[Socket] clear-board DB error | roomId=${roomId} |`, err.message);
        socket.emit("clear-board-error", { message: err.message || "Failed to clear board" });
      }
    });


    socket.on("draw-stroke", ({ stroke, roomId: payloadRoomId }) => {
      const roomId = payloadRoomId || socket.data.roomId;
      if (!roomId || !stroke) return;

      // Persist to MongoDB only — real-time rendering handled by draw-segment
      // Update in-memory stroke cache
      if (!roomStrokes.has(roomId)) {
        roomStrokes.set(roomId, []);
      }
      const strokes = roomStrokes.get(roomId);
      strokes.push(stroke);
      if (strokes.length > MAX_STROKES_PER_ROOM) strokes.shift();

      // Async DB persist — tagged with userId for personal undo
      (async () => {
        try {
          const room = await Room.findOne({ roomId });
          if (!room) {
            console.warn(`[Socket] draw-stroke: room not found | roomId=${roomId}`);
            return;
          }
          const taggedStroke = { ...stroke, userId: socket.data.userId };
          room.canvasData.push(taggedStroke);
          await room.save();
          console.log(`[Socket] Stroke saved | roomId=${roomId} | userId=${socket.data.userId} | total=${room.canvasData.length}`);
        } catch (err) {
          console.error(`[Socket] draw-stroke DB save failed | roomId=${roomId} |`, err.message);
        }
      })();
    });

    // Real-time segment broadcast — no DB, lowest latency possible
    socket.on("draw-segment", ({ segment, roomId: payloadRoomId }) => {
      const roomId = payloadRoomId || socket.data.roomId;
      if (!roomId || !segment) return;
      socket.to(roomId).emit("draw-segment", { segment, roomId });
    });


    socket.on("undo-stroke", async ({ roomId, userId } = {}) => {
      if (!roomId || !userId) return;

      try {
        const room = await Room.findOne({ roomId });
        if (!room) {
          console.warn(`[Socket] undo-stroke: room not found | roomId=${roomId}`);
          return;
        }

        // Find the last stroke belonging to this user
        const data = room.canvasData;
        let lastIndex = -1;
        for (let i = data.length - 1; i >= 0; i--) {
          if (data[i].userId === userId) {
            lastIndex = i;
            break;
          }
        }

        if (lastIndex === -1) {
          console.log(`[Socket] undo-stroke: no strokes found for userId=${userId} | roomId=${roomId}`);
          return;
        }

        const [removedStroke] = room.canvasData.splice(lastIndex, 1);
        room.redoStack.push(removedStroke);
        await room.save();
        console.log(`[Socket] undo-stroke: removed index=${lastIndex} | pushed to redoStack | userId=${userId} | canvasData=${room.canvasData.length} | redoStack=${room.redoStack.length}`);

        // Broadcast full updated canvas to everyone in the room
        io.to(roomId).emit("canvas-updated", room.canvasData);
      } catch (err) {
        console.error(`[Socket] undo-stroke DB error | roomId=${roomId} |`, err.message);
      }
    });

    socket.on("redo-stroke", async ({ roomId, userId } = {}) => {
      if (!roomId || !userId) return;

      try {
        const room = await Room.findOne({ roomId });
        if (!room) {
          console.warn(`[Socket] redo-stroke: room not found | roomId=${roomId}`);
          return;
        }

        // Find the last stroke in redoStack belonging to this user
        const stack = room.redoStack;
        let lastIndex = -1;
        for (let i = stack.length - 1; i >= 0; i--) {
          if (stack[i].userId === userId) {
            lastIndex = i;
            break;
          }
        }

        if (lastIndex === -1) {
          console.log(`[Socket] redo-stroke: nothing to redo for userId=${userId} | roomId=${roomId}`);
          return;
        }

        const [redoStroke] = room.redoStack.splice(lastIndex, 1);
        room.canvasData.push(redoStroke);
        await room.save();
        console.log(`[Socket] redo-stroke: restored stroke | userId=${userId} | canvasData=${room.canvasData.length} | redoStack=${room.redoStack.length}`);

        // Broadcast full updated canvas to everyone in the room
        io.to(roomId).emit("canvas-updated", room.canvasData);
      } catch (err) {
        console.error(`[Socket] redo-stroke DB error | roomId=${roomId} |`, err.message);
      }
    });

    socket.on("send-message", async ({ roomId, userId, message } = {}) => {
      if (!roomId || !userId || !message?.trim()) return;

      try {
        const room = await Room.findOne({ roomId });
        if (!room) {
          console.warn(`[Socket] send-message: room not found | roomId=${roomId}`);
          return;
        }

        // Push and let Mongoose auto-set timestamp via schema default
        room.chatMessages.push({ userId, message: message.trim() });
        await room.save();

        // The saved subdocument (with _id + timestamp) is the last element
        const saved = room.chatMessages[room.chatMessages.length - 1];
        console.log(`[Socket] send-message | roomId=${roomId} | userId=${userId} | msg="${saved.message}"`);

        // Broadcast to the entire room (including sender)
        io.to(roomId).emit("receive-message", {
          _id: saved._id,
          userId: saved.userId,
          message: saved.message,
          timestamp: saved.timestamp,
        });
      } catch (err) {
        console.error(`[Socket] send-message DB error | roomId=${roomId} |`, err.message);
      }
    });

    socket.on("disconnect", (reason) => {
      const roomId = socket.data.roomId;
      const userId = socket.data.userId;
      if (roomId && roomUsers.has(roomId)) {
        roomUsers.get(roomId).delete(socket.id);
        if (roomUsers.get(roomId).size === 0) {
          roomUsers.delete(roomId);
          roomStrokes.delete(roomId);
          // Room empty — notify with empty list
          io.to(roomId).emit("online-users", []);
        } else {
          broadcastParticipantCount(io, roomId);
          broadcastOnlineUsers(io, roomId);
        }
      }
      console.log(`[Socket] User disconnected: ${socket.id} | userId=${userId ?? 'unknown'} - Reason: ${reason}`);
    });
  });
};

module.exports = { registerSocketHandlers };
