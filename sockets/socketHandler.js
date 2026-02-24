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
  io.to(roomId).emit("participant-count-updated", { roomId, count });
};

const registerSocketHandlers = (io) => {
  io.on("connection", (socket) => {
    console.log(`[Socket] User connected: ${socket.id}`);

    socket.on("join-room", ({ roomId, userId }) => {
      if (!roomId || !userId) return;

      socket.join(roomId);

      if (!roomUsers.has(roomId)) {
        roomUsers.set(roomId, new Map());
      }
      roomUsers.get(roomId).set(socket.id, userId);

      socket.data.roomId = roomId;
      socket.data.userId = userId;

      socket.to(roomId).emit("user-joined", { userId });
      broadcastParticipantCount(io, roomId);
    });

    socket.on("clear-board", async ({ roomId, userId }) => {
      try {
        if (!roomId || !userId) {
          socket.emit("clear-board-error", { message: "roomId and userId are required" });
          return;
        }
        const room = await Room.findOne({ roomId }).lean();
        if (!room) {
          socket.emit("clear-board-error", { message: "Room not found" });
          return;
        }
        const hostId = room.host?.toString?.() || room.host;
        if (hostId !== userId) {
          socket.emit("clear-board-error", { message: "Only host can clear the board" });
          return;
        }
        io.to(roomId).emit("board-cleared", { roomId });
        roomStrokes.set(roomId, []);
      } catch (err) {
        socket.emit("clear-board-error", { message: err.message || "Failed to clear board" });
      }
    });

    socket.on("draw-stroke", ({ stroke, roomId: payloadRoomId }) => {
      const roomId = payloadRoomId || socket.data.roomId;
      if (!roomId || !stroke) return;

      socket.to(roomId).emit("draw-stroke", { stroke, roomId });

      if (!roomStrokes.has(roomId)) {
        roomStrokes.set(roomId, []);
      }
      const strokes = roomStrokes.get(roomId);
      strokes.push(stroke);
      if (strokes.length > MAX_STROKES_PER_ROOM) {
        strokes.shift();
      }
    });

    socket.on("disconnect", (reason) => {
      const roomId = socket.data.roomId;
      if (roomId && roomUsers.has(roomId)) {
        roomUsers.get(roomId).delete(socket.id);
        if (roomUsers.get(roomId).size === 0) {
          roomUsers.delete(roomId);
          roomStrokes.delete(roomId);
        } else {
          broadcastParticipantCount(io, roomId);
        }
      }
      console.log(`[Socket] User disconnected: ${socket.id} - Reason: ${reason}`);
    });
  });
};

module.exports = { registerSocketHandlers };
