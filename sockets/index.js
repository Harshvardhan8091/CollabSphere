"use strict";

const { Server } = require("socket.io");

const initSocket = (server) => {
  const io = new Server(server, {
    cors: {
      origin: process.env.CORS_ORIGIN || "*",
      methods: ["GET", "POST"]
    }
  });

  io.on("connection", (socket) => {
    // eslint-disable-next-line no-console
    console.log(`Socket connected: ${socket.id}`);

    socket.on("disconnect", (reason) => {
      // eslint-disable-next-line no-console
      console.log(`Socket disconnected: ${socket.id} - Reason: ${reason}`);
    });
  });

  return io;
};

module.exports = { initSocket };

