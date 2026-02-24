"use strict";

const { Server } = require("socket.io");
const { registerSocketHandlers } = require("./socketHandler");

const getSocketCorsOrigins = () => {
  const origin = process.env.CORS_ORIGIN;
  if (origin) {
    return origin.split(",").map((o) => o.trim()).filter(Boolean);
  }
  const isDev = process.env.NODE_ENV !== "production";
  return isDev
    ? ["http://localhost:3000", "http://localhost:5173", "http://127.0.0.1:3000", "http://127.0.0.1:5173"]
    : [];
};

const initSocket = (server) => {
  const origins = getSocketCorsOrigins();

  const io = new Server(server, {
    cors: {
      origin: origins.length > 0 ? origins : true,
      methods: ["GET", "POST"],
      credentials: true
    }
  });

  registerSocketHandlers(io);

  return io;
};

module.exports = { initSocket };

