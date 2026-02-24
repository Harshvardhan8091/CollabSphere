"use strict";

const { v4: uuidv4 } = require("uuid");
const { Room } = require("../models");

const createRoom = async (req, res, next) => {
  try {
    const roomId = uuidv4();
    const room = await Room.create({
      roomId,
      host: req.user._id,
      participants: [req.user._id]
    });
    const populated = await room.populate(["host", "participants"], "-password");
    res.status(201).json(populated);
  } catch (err) {
    next(err);
  }
};

const joinRoom = async (req, res, next) => {
  try {
    const { roomId } = req.body;
    if (!roomId) {
      res.status(400);
      throw new Error("roomId is required");
    }
    const room = await Room.findOne({ roomId });
    if (!room) {
      res.status(404);
      throw new Error("Room not found");
    }
    const alreadyJoined = room.participants.some(
      (p) => p.toString() === req.user._id.toString()
    );
    if (!alreadyJoined) {
      room.participants.push(req.user._id);
      await room.save();
    }
    const populated = await room.populate(["host", "participants"], "-password");
    res.json(populated);
  } catch (err) {
    next(err);
  }
};

const getRoomDetails = async (req, res, next) => {
  try {
    const { roomId } = req.params;
    const room = await Room.findOne({ roomId }).populate(
      ["host", "participants"],
      "-password"
    );
    if (!room) {
      res.status(404);
      throw new Error("Room not found");
    }
    res.json(room);
  } catch (err) {
    next(err);
  }
};

module.exports = {
  createRoom,
  joinRoom,
  getRoomDetails
};
