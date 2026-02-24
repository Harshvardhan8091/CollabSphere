"use strict";

const express = require("express");

const router = express.Router();

// Health check route
router.use("/", require("./healthRoutes"));

// Auth routes
router.use("/auth", require("./authRoutes"));

// Room routes (protected)
router.use("/rooms", require("./roomRoutes"));

// Define additional API routes here, e.g.:
// router.use("/users", require("./userRoutes"));

module.exports = router;

