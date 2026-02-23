"use strict";

const mongoose = require("mongoose");

const MONGO_URI = process.env.MONGO_URI;

const connectDB = async () => {
  if (!MONGO_URI) {
    // eslint-disable-next-line no-console
    console.warn("MONGO_URI is not set. Skipping MongoDB connection.");
    return;
  }

  try {
    await mongoose.connect(MONGO_URI, {
      useNewUrlParser: true,
      useUnifiedTopology: true
    });

    // eslint-disable-next-line no-console
    console.log("MongoDB connected");
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error("MongoDB connection error:", error.message);
    // Do not crash the server if DB connection fails
  }
};

mongoose.connection.on("error", (err) => {
  // eslint-disable-next-line no-console
  console.error("MongoDB runtime error:", err.message);
});

module.exports = connectDB;

