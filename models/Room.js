"use strict";

const mongoose = require("mongoose");

const roomSchema = new mongoose.Schema(
  {
    roomId: {
      type: String,
      required: true,
      unique: true
    },
    host: {
      type: String,
      default: null
    },
    participants: [
      {
        userId: { type: String, required: true },
        role: {
          type: String,
          enum: ["host", "editor", "viewer"],
          default: "editor"
        }
      }
    ],
    canvasData: {
      type: Array,
      default: []
    },
    redoStack: {
      type: [Object],
      default: []
    },
    chatMessages: [
      {
        userId: { type: String, required: true },
        message: { type: String, required: true },
        timestamp: { type: Date, default: Date.now }
      }
    ],
    createdAt: {
      type: Date,
      default: Date.now
    }
  },
  {
    timestamps: false
  }
);

const Room = mongoose.model("Room", roomSchema);

module.exports = Room;
