"use strict";

require("dotenv").config();

const http = require("http");
const express = require("express");
const cors = require("cors");

const connectDB = require("./config/db");
const { initSocket } = require("./sockets");
const notFound = require("./middleware/notFound");
const errorHandler = require("./middleware/errorHandler");

const app = express();

// Basic app settings from environment
const PORT = process.env.PORT || 5000;
const NODE_ENV = process.env.NODE_ENV || "development";
const JWT_SECRET = process.env.JWT_SECRET;

if (!JWT_SECRET) {
  // eslint-disable-next-line no-console
  console.warn("JWT_SECRET is not set. JWT-based features will be disabled until it is configured.");
}

// Connect to MongoDB (non-fatal if env is missing or connection fails)
connectDB();

// CORS configuration
const corsOptions = {
  origin: process.env.CORS_ORIGIN || "*",
  methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
  credentials: true
};

app.use(cors(corsOptions));

// Body parsing
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// API routes
app.use("/api", require("./routes"));

// 404 handler
app.use(notFound);

// Centralized error handler
app.use(errorHandler);

const server = http.createServer(app);

// Initialize Socket.io
const io = initSocket(server);

server.listen(PORT, () => {
  // eslint-disable-next-line no-console
  console.log(`Server running in ${NODE_ENV} mode on port ${PORT}`);
});

module.exports = { app, server, io };

