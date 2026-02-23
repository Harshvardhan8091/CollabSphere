# CollabSphere Backend

Node.js + Express backend setup for a MERN application.

## Tech Stack

- **Runtime**: Node.js
- **Framework**: Express
- **Database**: MongoDB with Mongoose
- **Environment Variables**: dotenv
- **Real-time**: Socket.io

## Project Structure

- `server.js` - Application entry point
- `config/` - Configuration (e.g. MongoDB connection)
  - `db.js`
- `controllers/` - Controllers (request handlers, no logic yet)
- `models/` - Mongoose models
- `routes/` - Route definitions
  - `index.js`
- `middleware/` - Custom middleware
  - `notFound.js`
  - `errorHandler.js`
- `sockets/` - Socket.io setup
  - `index.js`

## Getting Started

1. **Install dependencies**

   ```bash
   npm install
   ```

2. **Create environment file**

   Copy `.env.example` to `.env` and adjust values:

   ```bash
   cp .env.example .env
   ```

3. **Run in development**

   ```bash
   npm run dev
   ```

4. **Run in production**

   ```bash
   npm start
   ```

## Notes

- CORS is enabled and configurable via `CORS_ORIGIN`.
- JSON body parsing is enabled globally.
- Socket.io is wired to the HTTP server with basic connection/disconnection logs.
- No feature/business logic has been implemented yet.

