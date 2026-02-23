"use strict";

// eslint-disable-next-line no-unused-vars
const errorHandler = (err, req, res, next) => {
  const statusCode = res.statusCode && res.statusCode !== 200 ? res.statusCode : 500;

  res.status(statusCode);

  const response = {
    message: err.message || "Internal Server Error"
  };

  if (process.env.NODE_ENV === "development") {
    response.stack = err.stack;
  }

  res.json(response);
};

module.exports = errorHandler;

