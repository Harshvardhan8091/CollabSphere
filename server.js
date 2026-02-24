"use strict";

require("dotenv").config();

const http = require("http");
const path = require("path");
const express = require("express");
const cors = require("cors");

const connectDB = require("./config/db");
const { initSocket } = require("./sockets");
const notFound = require("./middleware/notFound");
const errorHandler = require("./middleware/errorHandler");

const app = express();

// ================= ENV CONFIG =================
const PORT = process.env.PORT || 5000;
const NODE_ENV = process.env.NODE_ENV || "development";

if (!process.env.JWT_SECRET) {
  console.warn("JWT_SECRET is not set.");
}

if (!process.env.MONGO_URI) {
  console.warn("MONGO_URI is not set.");
}

// ================= DATABASE =================
connectDB();

// ================= CORS =================
const corsOptions = {
  origin: process.env.CORS_ORIGIN
    ? process.env.CORS_ORIGIN.split(",")
    : "*",
  methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
  credentials: true
};

app.use(cors(corsOptions));

// ================= MIDDLEWARE =================
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// ✅ Serve static files from "public" using absolute path (must be BEFORE API routes & 404)
app.use(express.static(path.join(__dirname, "public")));

// ================= ROUTES =================
app.use("/api", require("./routes"));

// ================= 404 + ERROR =================
app.use(notFound);
app.use(errorHandler);

// ================= SERVER + SOCKET =================
const server = http.createServer(app);
const io = initSocket(server);

server.listen(PORT, () => {
  console.log(`Server running in ${NODE_ENV} mode on port ${PORT}`);
});

module.exports = { app, server, io };