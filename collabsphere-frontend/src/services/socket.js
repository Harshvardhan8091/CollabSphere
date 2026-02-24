import { io } from 'socket.io-client'

// ── Config ────────────────────────────────────────────────────────────────────
// Falls back to localhost:5000 in dev; override via VITE_BACKEND_URL in .env
const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || 'http://localhost:5000'

// ── Singleton instance ────────────────────────────────────────────────────────
let socket = null

/**
 * Connect to the backend Socket.io server.
 * Returns the existing connected instance if already connected.
 */
export const connectSocket = () => {
    if (socket && socket.connected) return socket

    socket = io(BACKEND_URL, {
        transports: ['websocket', 'polling'],
        withCredentials: true,
    })

    socket.on('connect', () => {
        console.log('[Socket] Connected:', socket.id, '→', BACKEND_URL)
    })

    socket.on('disconnect', (reason) => {
        console.log('[Socket] Disconnected:', reason)
    })

    socket.on('connect_error', (err) => {
        console.error('[Socket] Connection error:', err.message)
    })

    return socket
}

/**
 * Return the existing socket instance.
 * Returns null if connectSocket() has not been called yet.
 */
export const getSocket = () => socket

/**
 * Disconnect and clear the socket instance.
 */
export const disconnectSocket = () => {
    if (socket) {
        socket.disconnect()
        socket = null
        console.log('[Socket] Instance disconnected and cleared.')
    }
}
