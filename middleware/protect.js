"use strict";

const jwt = require("jsonwebtoken");
const { User } = require("../models");

const JWT_SECRET = process.env.JWT_SECRET;

/**
 * Protect middleware: verifies JWT from Authorization header (Bearer <token>)
 * and attaches the authenticated user to req.user.
 */
const protect = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      res.status(401);
      throw new Error("Access denied. No token provided.");
    }

    const token = authHeader.split(" ")[1];

    if (!token) {
      res.status(401);
      throw new Error("Access denied. No token provided.");
    }

    if (!JWT_SECRET) {
      res.status(500);
      throw new Error("JWT_SECRET is not configured.");
    }

    const decoded = jwt.verify(token, JWT_SECRET);

    const user = await User.findById(decoded.id).select("-password");

    if (!user) {
      res.status(401);
      throw new Error("User not found. Token may be invalid.");
    }

    req.user = user;
    next();
  } catch (err) {
    if (err.name === "JsonWebTokenError") {
      res.status(401);
      err.message = "Invalid token.";
    }
    if (err.name === "TokenExpiredError") {
      res.status(401);
      err.message = "Token expired.";
    }
    next(err);
  }
};

module.exports = protect;
