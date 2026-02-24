"use strict";

const express = require("express");
const { RoomController } = require("../controllers");
const protect = require("../middleware/protect");

const router = express.Router();

router.post("/create", protect, RoomController.createRoom);
router.post("/join", protect, RoomController.joinRoom);
router.get("/:roomId", protect, RoomController.getRoomDetails);

module.exports = router;
