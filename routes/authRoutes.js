"use strict";

const express = require("express");
const { AuthController } = require("../controllers");
const protect = require("../middleware/protect");

const router = express.Router();

router.post("/register", AuthController.register);
router.post("/login", AuthController.login);
router.post("/logout", AuthController.logout);

// Protected route: returns current user (requires Bearer token)
router.get("/me", protect, (req, res) => {
  res.json(req.user);
});

module.exports = router;

