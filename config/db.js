"use strict";

const mongoose = require("mongoose");

const MONGO_URI = process.env.MONGO_URI;

const connectDB = async () => {
  if (!MONGO_URI) {
    console.warn("MONGO_URI is not set. Skipping MongoDB connection.");
    return;
  }
  try {
    await mongoose.connect(MONGO_URI);
    console.log("MongoDB connected");
  } catch (error) {
    console.error("MongoDB connection error:", error.message);
  }
};

module.exports = connectDB;
