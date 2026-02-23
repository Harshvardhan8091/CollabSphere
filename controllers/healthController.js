"use strict";

const getHealth = (req, res) => {
  res.status(200).json({
    status: "Server running",
    timestamp: new Date().toISOString()
  });
};

module.exports = {
  getHealth
};

