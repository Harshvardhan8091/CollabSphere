import { useRef, useState, useEffect, useCallback } from 'react'
import { connectSocket, getSocket, disconnectSocket } from '../services/socket'

// Stable userId — persisted across refreshes via localStorage
const MY_USER_ID = (() => {
    const KEY = 'collab_user_id'
    let id = localStorage.getItem(KEY)
    if (!id) {
        id = 'user-' + Math.random().toString(36).slice(2, 8)
        localStorage.setItem(KEY, id)
    }
    return id
})()
const ROOM_ID = 'test-room-123'

function Whiteboard() {
    const canvasRef = useRef(null)
    const [isDrawing, setIsDrawing] = useState(false)
    const [color, setColor] = useState('#000000')
    const [brushSize, setBrushSize] = useState(3)

    // ── Chat state ────────────────────────────────────────────────────────────
    const [chatMessages, setChatMessages] = useState([])
    const [chatInput, setChatInput] = useState('')
    const chatEndRef = useRef(null)

    // ── Presence state ────────────────────────────────────────────────────────
    const [onlineUsers, setOnlineUsers] = useState([])
    const [myRole, setMyRole] = useState(null)  // 'host' | 'editor' | 'viewer'

    // Current stroke points collected during a single mouse-drag
    const currentStroke = useRef([])
    // Track drawing state in a ref too (for use inside event listeners)
    const isDrawingRef = useRef(false)
    // Previous mouse position — used to emit draw-segment intervals
    const prevPos = useRef(null)

    // Auto-scroll chat to bottom whenever messages change
    useEffect(() => {
        chatEndRef.current?.scrollIntoView({ behavior: 'smooth' })
    }, [chatMessages])

    // ── Canvas resize ─────────────────────────────────────────────────────────
    const resizeCanvas = useCallback(() => {
        const canvas = canvasRef.current
        if (!canvas) return
        const ctx = canvas.getContext('2d')
        const snapshot = ctx.getImageData(0, 0, canvas.width, canvas.height)
        canvas.width = window.innerWidth
        canvas.height = window.innerHeight
        ctx.putImageData(snapshot, 0, 0)
    }, [])

    useEffect(() => {
        resizeCanvas()
        window.addEventListener('resize', resizeCanvas)
        return () => window.removeEventListener('resize', resizeCanvas)
    }, [resizeCanvas])

    // ── Socket setup ──────────────────────────────────────────────────────────
    useEffect(() => {
        const socket = connectSocket()

        socket.emit('join-room', { roomId: ROOM_ID, userId: MY_USER_ID })

        // Shared helper: clear canvas and redraw all strokes in order
        const replayCanvas = (strokes) => {
            const canvas = canvasRef.current
            if (!canvas) return
            const ctx = canvas.getContext('2d')
            ctx.clearRect(0, 0, canvas.width, canvas.height)
            strokes.forEach(stroke => renderStroke(stroke))
            console.log(`[Canvas] Replayed ${strokes.length} stroke(s)`)
        }

        // Load persisted canvas on join — fires only for THIS socket
        socket.on('load-canvas', (strokes) => {
            if (!Array.isArray(strokes)) return
            replayCanvas(strokes)
        })

        // Full canvas re-render after undo (broadcast to everyone in room)
        socket.on('canvas-updated', (strokes) => {
            if (!Array.isArray(strokes)) return
            replayCanvas(strokes)
            console.log('[Canvas] canvas-updated: redrawn with', strokes.length, 'stroke(s)')
        })

        // Real-time segment from other users — draw immediately, no full-stroke wait
        socket.on('draw-segment', ({ segment }) => {
            if (!segment) return
            const canvas = canvasRef.current
            if (!canvas) return
            const ctx = canvas.getContext('2d')
            ctx.beginPath()
            ctx.moveTo(segment.x0, segment.y0)
            ctx.lineTo(segment.x1, segment.y1)
            ctx.strokeStyle = segment.color
            ctx.lineWidth = segment.size
            ctx.lineCap = 'round'
            ctx.lineJoin = 'round'
            ctx.stroke()
            ctx.closePath()
        })

        // Load persisted chat history on join — fires only for THIS socket
        socket.on('load-chat', (messages) => {
            if (!Array.isArray(messages)) return
            setChatMessages(messages)
        })

        // Receive new message broadcast from server
        socket.on('receive-message', (msg) => {
            if (!msg) return
            setChatMessages(prev => [...prev, msg])
        })

        // Live presence list — broadcast by server on every join/disconnect
        socket.on('online-users', (users) => {
            if (!Array.isArray(users)) return
            setOnlineUsers(users)
        })

        // Role assigned by server immediately after join-room
        socket.on('role-assigned', (role) => {
            setMyRole(role)
            console.log('[Socket] Role assigned:', role)
        })

        return () => {
            socket.off('load-canvas')
            socket.off('canvas-updated')
            socket.off('draw-segment')
            socket.off('load-chat')
            socket.off('receive-message')
            socket.off('online-users')
            socket.off('role-assigned')
            disconnectSocket()
        }
    }, []) // eslint-disable-line react-hooks/exhaustive-deps

    // ── Render a stroke (points array) onto canvas ───────────────────────────
    const renderStroke = (stroke) => {
        const canvas = canvasRef.current
        if (!canvas) return
        const ctx = canvas.getContext('2d')
        const { points, color: strokeColor, size } = stroke
        if (!points || points.length < 1) return

        ctx.beginPath()
        ctx.moveTo(points[0].x, points[0].y)
        for (let i = 1; i < points.length; i++) {
            ctx.lineTo(points[i].x, points[i].y)
        }
        ctx.strokeStyle = strokeColor
        ctx.lineWidth = size
        ctx.lineCap = 'round'
        ctx.lineJoin = 'round'
        ctx.stroke()
        ctx.closePath()
    }

    // ── Position helper ───────────────────────────────────────────────────────
    const getPos = (e) => {
        const rect = canvasRef.current.getBoundingClientRect()
        const src = e.touches ? e.touches[0] : e
        return { x: src.clientX - rect.left, y: src.clientY - rect.top }
    }

    // ── Mouse handlers ────────────────────────────────────────────────────────
    const onMouseDown = (e) => {
        const pos = getPos(e)
        currentStroke.current = [pos]
        prevPos.current = pos
        isDrawingRef.current = true
        setIsDrawing(true)

        const ctx = canvasRef.current.getContext('2d')
        ctx.beginPath()
        ctx.moveTo(pos.x, pos.y)
    }

    const onMouseMove = (e) => {
        if (!isDrawingRef.current) return
        const pos = getPos(e)
        currentStroke.current.push(pos)

        // Draw locally in real-time
        const ctx = canvasRef.current.getContext('2d')
        ctx.lineTo(pos.x, pos.y)
        ctx.strokeStyle = color
        ctx.lineWidth = brushSize
        ctx.lineCap = 'round'
        ctx.lineJoin = 'round'
        ctx.stroke()

        // Emit segment to other users immediately
        const prev = prevPos.current
        if (prev) {
            const socket = getSocket()
            if (socket?.connected) {
                socket.emit('draw-segment', {
                    roomId: ROOM_ID,
                    segment: { x0: prev.x, y0: prev.y, x1: pos.x, y1: pos.y, color, size: brushSize },
                })
            }
        }
        prevPos.current = pos
    }

    const onMouseUp = () => {
        if (!isDrawingRef.current) return
        isDrawingRef.current = false
        setIsDrawing(false)
        canvasRef.current.getContext('2d').closePath()

        // Emit completed stroke to server
        if (currentStroke.current.length > 0) {
            const socket = getSocket()
            if (socket?.connected) {
                socket.emit('draw-stroke', {
                    roomId: ROOM_ID,
                    stroke: {
                        points: currentStroke.current,
                        color,
                        size: brushSize,
                    },
                })
            }
            currentStroke.current = []
        }
    }

    // ── Toolbar actions ──────────────────────────────────────────────────
    const clearCanvas = () => {
        const canvas = canvasRef.current
        canvas.getContext('2d').clearRect(0, 0, canvas.width, canvas.height)
    }

    const handleUndo = () => {
        const socket = getSocket()
        if (!socket?.connected) return
        socket.emit('undo-stroke', { roomId: ROOM_ID, userId: MY_USER_ID })
        console.log('[Canvas] Emitted undo-stroke for userId:', MY_USER_ID)
    }

    const handleRedo = () => {
        const socket = getSocket()
        if (!socket?.connected) return
        socket.emit('redo-stroke', { roomId: ROOM_ID, userId: MY_USER_ID })
        console.log('[Canvas] Emitted redo-stroke for userId:', MY_USER_ID)
    }

    // ── Chat ──────────────────────────────────────────────────────────────────
    const sendMessage = () => {
        const text = chatInput.trim()
        if (!text) return
        const socket = getSocket()
        if (!socket?.connected) return
        socket.emit('send-message', { roomId: ROOM_ID, userId: MY_USER_ID, message: text })
        setChatInput('')
    }

    const onChatKeyDown = (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault()
            sendMessage()
        }
    }

    return (
        <div style={{ position: 'relative', width: '100vw', height: '100vh', overflow: 'hidden' }}>
            {/* Floating toolbar */}
            <div style={toolbarStyle}>
                <label style={labelStyle}>
                    Color
                    <input type="color" value={color}
                        onChange={(e) => setColor(e.target.value)}
                        style={{ marginLeft: '0.4rem', cursor: 'pointer' }} />
                </label>

                <label style={labelStyle}>
                    Size
                    <input type="range" min={1} max={30} value={brushSize}
                        onChange={(e) => setBrushSize(Number(e.target.value))}
                        style={{ marginLeft: '0.4rem' }} />
                    <span style={{ marginLeft: '0.4rem', minWidth: '1.5rem' }}>{brushSize}</span>
                </label>

                <button
                    onClick={clearCanvas}
                    disabled={myRole !== 'host'}
                    style={{
                        ...btnStyle,
                        opacity: myRole !== 'host' ? 0.35 : 1,
                        cursor: myRole !== 'host' ? 'not-allowed' : 'pointer',
                    }}
                    title={myRole !== 'host' ? 'Only the host can clear the board' : 'Clear board'}
                >
                    Clear
                </button>
                <button onClick={handleUndo} style={{ ...btnStyle, background: '#555' }}>↩ Undo</button>
                <button onClick={handleRedo} style={{ ...btnStyle, background: '#2a7' }}>↪ Redo</button>

                {/* Role badge */}
                <span style={roleBadgeStyle(myRole)}>
                    {myRole === 'host' ? '👑 Host' : myRole === 'editor' ? '✏️ Editor' : myRole ? myRole : '⋯'}
                </span>
            </div>

            {/* Canvas */}
            <canvas
                ref={canvasRef}
                style={{ display: 'block', cursor: isDrawing ? 'crosshair' : 'default', background: '#fff' }}
                onMouseDown={onMouseDown}
                onMouseMove={onMouseMove}
                onMouseUp={onMouseUp}
                onMouseLeave={onMouseUp}
            />

            {/* ── Online Users Panel (left side) ── */}
            <div style={presencePanelStyle}>
                <div style={presenceHeaderStyle}>👥 Online ({onlineUsers.length})</div>
                <div style={presenceListStyle}>
                    {onlineUsers.map(uid => {
                        const isMe = uid === MY_USER_ID
                        return (
                            <div key={uid} style={presenceRowStyle(isMe)}>
                                <span style={presenceDotStyle(isMe)} />
                                <span style={{ fontWeight: isMe ? 600 : 400 }}>
                                    {isMe ? `${uid} (you)` : uid}
                                </span>
                            </div>
                        )
                    })}
                    {onlineUsers.length === 0 && (
                        <div style={{ color: '#555', fontSize: '0.75rem' }}>No users</div>
                    )}
                </div>
            </div>

            {/* ── Chat Panel ── */}
            <div style={chatPanelStyle}>
                <div style={chatHeaderStyle}>💬 Chat</div>

                {/* Message list */}
                <div style={chatListStyle}>
                    {chatMessages.map((msg, i) => {
                        const isMe = msg.userId === MY_USER_ID
                        return (
                            <div key={msg._id ?? i} style={msgWrapStyle(isMe)}>
                                {!isMe && (
                                    <div style={msgUserStyle}>{msg.userId}</div>
                                )}
                                <div style={msgBubbleStyle(isMe)}>{msg.message}</div>
                                <div style={msgTimeStyle}>
                                    {msg.timestamp
                                        ? new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
                                        : ''}
                                </div>
                            </div>
                        )
                    })}
                    <div ref={chatEndRef} />
                </div>

                {/* Input row */}
                <div style={chatInputRowStyle}>
                    <input
                        value={chatInput}
                        onChange={e => setChatInput(e.target.value)}
                        onKeyDown={onChatKeyDown}
                        placeholder="Type a message…"
                        style={chatInputStyle}
                    />
                    <button onClick={sendMessage} style={chatSendBtnStyle}>Send</button>
                </div>
            </div>
        </div>
    )
}

// ── Styles ────────────────────────────────────────────────────────────────────
const toolbarStyle = {
    position: 'absolute', top: '1rem', left: '50%', transform: 'translateX(-50%)',
    zIndex: 10, display: 'flex', alignItems: 'center', gap: '1.25rem',
    padding: '0.5rem 1.25rem', background: 'rgba(20,20,20,0.85)',
    borderRadius: '999px', color: '#fff', fontFamily: 'system-ui, sans-serif',
    fontSize: '0.875rem', backdropFilter: 'blur(6px)',
    boxShadow: '0 2px 12px rgba(0,0,0,0.3)',
}
const labelStyle = { display: 'flex', alignItems: 'center', gap: '0.25rem' }
const btnStyle = {
    padding: '0.35rem 0.9rem', borderRadius: '6px', border: 'none',
    background: '#e55', color: '#fff', cursor: 'pointer',
    fontFamily: 'inherit', fontSize: '0.875rem',
}

// ── Chat styles ───────────────────────────────────────────────────────────────
const chatPanelStyle = {
    position: 'absolute', top: 0, right: 0, width: '280px', height: '100vh',
    display: 'flex', flexDirection: 'column',
    background: 'rgba(18,18,22,0.93)', backdropFilter: 'blur(8px)',
    borderLeft: '1px solid rgba(255,255,255,0.08)',
    fontFamily: 'system-ui, sans-serif', color: '#f0f0f0', zIndex: 20,
}
const chatHeaderStyle = {
    padding: '0.75rem 1rem', fontSize: '0.9rem', fontWeight: 600,
    borderBottom: '1px solid rgba(255,255,255,0.08)', letterSpacing: '0.02em',
}
const chatListStyle = {
    flex: 1, overflowY: 'auto', padding: '0.75rem',
    display: 'flex', flexDirection: 'column', gap: '0.5rem',
}
const msgWrapStyle = (isMe) => ({
    display: 'flex', flexDirection: 'column',
    alignItems: isMe ? 'flex-end' : 'flex-start',
})
const msgUserStyle = {
    fontSize: '0.65rem', color: '#888', marginBottom: '0.15rem', paddingLeft: '0.25rem',
}
const msgBubbleStyle = (isMe) => ({
    maxWidth: '90%', padding: '0.4rem 0.7rem',
    borderRadius: isMe ? '12px 12px 2px 12px' : '12px 12px 12px 2px',
    background: isMe ? '#4f6ef7' : 'rgba(255,255,255,0.1)',
    fontSize: '0.82rem', lineHeight: 1.4, wordBreak: 'break-word',
})
const msgTimeStyle = {
    fontSize: '0.6rem', color: '#555', marginTop: '0.15rem', paddingRight: '0.25rem',
}
const chatInputRowStyle = {
    display: 'flex', gap: '0.4rem', padding: '0.6rem',
    borderTop: '1px solid rgba(255,255,255,0.08)',
}
const chatInputStyle = {
    flex: 1, padding: '0.45rem 0.65rem', borderRadius: '6px',
    border: '1px solid rgba(255,255,255,0.12)',
    background: 'rgba(255,255,255,0.07)', color: '#f0f0f0',
    fontSize: '0.82rem', outline: 'none', fontFamily: 'inherit',
}
const chatSendBtnStyle = {
    padding: '0.45rem 0.8rem', borderRadius: '6px', border: 'none',
    background: '#4f6ef7', color: '#fff', cursor: 'pointer',
    fontSize: '0.82rem', fontFamily: 'inherit', fontWeight: 600,
}

// ── Presence panel styles ─────────────────────────────────────────────────────
const presencePanelStyle = {
    position: 'absolute', top: 0, left: 0, width: '190px', height: '100vh',
    display: 'flex', flexDirection: 'column',
    background: 'rgba(18,18,22,0.88)', backdropFilter: 'blur(8px)',
    borderRight: '1px solid rgba(255,255,255,0.08)',
    fontFamily: 'system-ui, sans-serif', color: '#f0f0f0', zIndex: 20,
}
const presenceHeaderStyle = {
    padding: '0.75rem 1rem', fontSize: '0.82rem', fontWeight: 600,
    borderBottom: '1px solid rgba(255,255,255,0.08)', letterSpacing: '0.02em',
}
const presenceListStyle = {
    flex: 1, overflowY: 'auto', padding: '0.6rem 0.75rem',
    display: 'flex', flexDirection: 'column', gap: '0.45rem',
}
const presenceRowStyle = (isMe) => ({
    display: 'flex', alignItems: 'center', gap: '0.5rem',
    fontSize: '0.75rem',
    color: isMe ? '#7eb8ff' : '#ccc',
    padding: '0.2rem 0',
})
const presenceDotStyle = (isMe) => ({
    width: '8px', height: '8px', borderRadius: '50%', flexShrink: 0,
    background: isMe ? '#4fc67a' : '#888',
    boxShadow: isMe ? '0 0 6px #4fc67a' : 'none',
})

export default Whiteboard
