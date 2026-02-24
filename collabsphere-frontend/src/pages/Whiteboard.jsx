import { useRef, useState, useEffect, useCallback } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { connectSocket, getSocket, disconnectSocket } from '../services/socket'
import { useTheme } from '../context/ThemeContext'
import { useAuth } from '../context/AuthContext'

// Get userId from authenticated user
const Whiteboard = () => {
    const { roomId } = useParams()
    const navigate = useNavigate()
    const { user } = useAuth()
    const MY_USER_ID = user?.id || user?.email || 'anonymous'
    const ROOM_ID = roomId || 'default-room'
    const canvasRef = useRef(null)
    const imageInputRef = useRef(null)
    const [isDrawing, setIsDrawing] = useState(false)
    const [color, setColor] = useState('#000000')
    const [brushSize, setBrushSize] = useState(3)
    const [canvasData, setCanvasData] = useState([]) // Single source of truth for all canvas items
    const { theme, toggleTheme } = useTheme()

    // ── Chat state ────────────────────────────────────────────────────────────
    const [chatMessages, setChatMessages] = useState([])
    const [chatInput, setChatInput] = useState('')
    const chatEndRef = useRef(null)

    // ── Presence state ────────────────────────────────────────────────────────
    const [onlineUsers, setOnlineUsers] = useState([])
    const [myRole, setMyRole] = useState(null)  // 'host' | 'editor' | 'viewer'
    const [selectedImageId, setSelectedImageId] = useState(null)
    const [isChatOpen, setIsChatOpen] = useState(false)
    const [isUsersDropdownOpen, setIsUsersDropdownOpen] = useState(false)
    const [activeTool, setActiveTool] = useState('pencil') // 'pencil' | 'eraser' | 'image'

    // Current stroke points collected during a single mouse-drag
    const currentStroke = useRef([])
    // Track drawing state in a ref too (for use inside event listeners)
    const isDrawingRef = useRef(false)
    // Previous mouse position — used to emit draw-segment intervals
    const prevPos = useRef(null)

    // ── Image drag refs ───────────────────────────────────────────────────────
    const imagesRef = useRef([])          // live image objects for hit-testing
    const canvasItemsRef = useRef([])     // all canvas items (strokes + images)
    const draggingImageRef = useRef(null) // { id, offsetX, offsetY } while dragging
    const resizingImageRef = useRef(null) // { id, startMouseX, startMouseY, startW, startH }
    const selectedImageIdRef = useRef(null) // mirrors selectedImageId state for use in redrawAll
    const lastEmitRef = useRef(0)         // throttle update-image / resize-image (ms)

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
        canvas.height = window.innerHeight - 64 // Account for top nav bar
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

        // Load persisted canvas on join — fires only for THIS socket
        socket.on('load-canvas', (items) => {
            if (!Array.isArray(items)) return
            setCanvasData(items)
            console.log(`[Canvas] Loaded ${items.length} item(s)`)
        })

        // Full canvas re-render after undo/redo/clear (broadcast to everyone in room)
        socket.on('canvas-updated', (items) => {
            if (!Array.isArray(items)) return
            setCanvasData(items)
            console.log('[Canvas] canvas-updated: redrawn with', items.length, 'item(s)')
        })

        // Completed stroke from another user — add to canvasData
        socket.on('draw-stroke', (stroke) => {
            if (!stroke) return
            setCanvasData(prev => [...prev, stroke])
            console.log('[Canvas] draw-stroke received')
        })

        // Real-time segment from other users — draw immediately for preview
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

        // Image added — add to canvasData
        socket.on('image-added', (imgObj) => {
            if (!imgObj?.src) return
            setCanvasData(prev => [...prev, imgObj])
            console.log('[Canvas] image-added:', imgObj.id)
        })

        // Image moved by another user — update canvasData
        socket.on('image-updated', ({ imageId, newX, newY }) => {
            setCanvasData(prev => prev.map(item => 
                item.id === imageId ? { ...item, x: newX, y: newY } : item
            ))
        })

        // Image resized by another user — update canvasData
        socket.on('image-resized', ({ imageId, newWidth, newHeight }) => {
            setCanvasData(prev => prev.map(item =>
                item.id === imageId ? { ...item, width: newWidth, height: newHeight } : item
            ))
        })

        return () => {
            socket.off('load-canvas')
            socket.off('canvas-updated')
            socket.off('draw-stroke')
            socket.off('draw-segment')
            socket.off('load-chat')
            socket.off('receive-message')
            socket.off('online-users')
            socket.off('role-assigned')
            socket.off('image-added')
            socket.off('image-updated')
            socket.off('image-resized')
            disconnectSocket()
        }
    }, []) // eslint-disable-line react-hooks/exhaustive-deps

    // ── Sync canvasData to refs and redraw whenever it changes ───────────────
    useEffect(() => {
        canvasItemsRef.current = canvasData
        imagesRef.current = canvasData.filter(i => i.type === 'image')
        redrawAll()
    }, [canvasData]) // eslint-disable-line react-hooks/exhaustive-deps

    // ── Update canvas background when theme changes ───────────────────────────
    useEffect(() => {
        const canvas = canvasRef.current
        if (!canvas) return
        // Redraw to apply new background
        redrawAll()
    }, [theme]) // eslint-disable-line react-hooks/exhaustive-deps

    // ── Close users dropdown when clicking outside ────────────────────────────
    useEffect(() => {
        const handleClickOutside = (e) => {
            if (isUsersDropdownOpen && !e.target.closest('[data-users-dropdown]')) {
                setIsUsersDropdownOpen(false)
            }
        }
        document.addEventListener('mousedown', handleClickOutside)
        return () => document.removeEventListener('mousedown', handleClickOutside)
    }, [isUsersDropdownOpen])

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

    // ── Draw a single image object onto canvas ────────────────────────────────
    const drawImageOnCanvas = (imgObj) => {
        const canvas = canvasRef.current
        if (!canvas || !imgObj?.src) return
        const img = new Image()
        img.onload = () => {
            canvas.getContext('2d').drawImage(img, imgObj.x, imgObj.y, imgObj.width, imgObj.height)
        }
        img.src = imgObj.src
    }

    // ── Redraw entire canvas from canvasItemsRef ──────────────────────────────
    const HANDLE = 10   // resize handle size in px

    const redrawAll = () => {
        const canvas = canvasRef.current
        if (!canvas) return
        const ctx = canvas.getContext('2d')
        ctx.clearRect(0, 0, canvas.width, canvas.height)
        canvasItemsRef.current.forEach(item => {
            if (item.type === 'image') drawImageOnCanvas(item)
            else renderStroke(item)
        })
        // Draw selection handle for selected image after all items rendered
        if (selectedImageIdRef.current) {
            const sel = imagesRef.current.find(i => i.id === selectedImageIdRef.current)
            if (sel) drawSelectionHandle(sel)
        }
    }

    // ── Draw resize handle on selected image ──────────────────────────────
    const drawSelectionHandle = (img) => {
        const canvas = canvasRef.current
        if (!canvas) return
        const ctx = canvas.getContext('2d')
        // Dashed border
        ctx.save()
        ctx.strokeStyle = '#4f6ef7'
        ctx.lineWidth = 1.5
        ctx.setLineDash([5, 3])
        ctx.strokeRect(img.x, img.y, img.width, img.height)
        // Solid resize square at bottom-right
        ctx.setLineDash([])
        ctx.fillStyle = '#4f6ef7'
        ctx.fillRect(img.x + img.width - HANDLE, img.y + img.height - HANDLE, HANDLE * 2, HANDLE * 2)
        ctx.restore()
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

        // Check if clicking inside any image (iterate in reverse = topmost first)
        const hit = [...imagesRef.current].reverse().find(
            img => pos.x >= img.x && pos.x <= img.x + img.width &&
                pos.y >= img.y && pos.y <= img.y + img.height
        )
        if (hit) {
            // Check if clicking on resize handle (bottom-right corner)
            const handleX = hit.x + hit.width - HANDLE
            const handleY = hit.y + hit.height - HANDLE
            const isOnHandle = pos.x >= handleX && pos.x <= handleX + HANDLE * 2 &&
                               pos.y >= handleY && pos.y <= handleY + HANDLE * 2

            if (isOnHandle) {
                // Start resize mode
                resizingImageRef.current = {
                    id: hit.id,
                    startMouseX: pos.x,
                    startMouseY: pos.y,
                    startW: hit.width,
                    startH: hit.height
                }
                setSelectedImageId(hit.id)
                selectedImageIdRef.current = hit.id
                return
            }

            // Start drag mode
            setSelectedImageId(hit.id)
            selectedImageIdRef.current = hit.id
            draggingImageRef.current = { id: hit.id, offsetX: pos.x - hit.x, offsetY: pos.y - hit.y }
            return // Don't start drawing
        }

        // Normal draw start
        setSelectedImageId(null)
        selectedImageIdRef.current = null
        currentStroke.current = [pos]
        prevPos.current = pos
        isDrawingRef.current = true
        setIsDrawing(true)

        const ctx = canvasRef.current.getContext('2d')
        ctx.beginPath()
        ctx.moveTo(pos.x, pos.y)
    }

    const onMouseMove = (e) => {
        const pos = getPos(e)

        // ── Image resize mode ────────────────────────────────────────────────
        if (resizingImageRef.current) {
            const { id, startMouseX, startMouseY, startW, startH } = resizingImageRef.current
            const deltaX = pos.x - startMouseX
            const deltaY = pos.y - startMouseY
            const newWidth = Math.max(50, startW + deltaX)
            const newHeight = Math.max(50, startH + deltaY)

            // Update refs directly for performance (avoid re-render on every mouse move)
            ;[canvasItemsRef.current, imagesRef.current].forEach(arr =>
                arr.forEach(i => { if (i.id === id) { i.width = newWidth; i.height = newHeight } })
            )
            redrawAll()

            // Throttled emit ~30 fps
            const now = Date.now()
            if (now - lastEmitRef.current > 33) {
                lastEmitRef.current = now
                const socket = getSocket()
                if (socket?.connected) {
                    socket.emit('resize-image', { roomId: ROOM_ID, imageId: id, newWidth, newHeight })
                }
            }
            return
        }

        // ── Image drag mode ──────────────────────────────────────────────────
        if (draggingImageRef.current) {
            const { id, offsetX, offsetY } = draggingImageRef.current
            const newX = pos.x - offsetX
            const newY = pos.y - offsetY

            // Update refs directly for performance (avoid re-render on every mouse move)
            ;[canvasItemsRef.current, imagesRef.current].forEach(arr =>
                arr.forEach(i => { if (i.id === id) { i.x = newX; i.y = newY } })
            )
            redrawAll()

            // Throttled emit ~30 fps
            const now = Date.now()
            if (now - lastEmitRef.current > 33) {
                lastEmitRef.current = now
                const socket = getSocket()
                if (socket?.connected) {
                    socket.emit('update-image', { roomId: ROOM_ID, imageId: id, newX, newY })
                }
            }
            return
        }

        // ── Normal drawing mode ───────────────────────────────────────────────
        if (!isDrawingRef.current) return
        currentStroke.current.push(pos)

        const ctx = canvasRef.current.getContext('2d')
        ctx.lineTo(pos.x, pos.y)
        ctx.strokeStyle = color
        ctx.lineWidth = brushSize
        ctx.lineCap = 'round'
        ctx.lineJoin = 'round'
        ctx.stroke()

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
        // Release resize and sync to canvasData + finalize to DB
        if (resizingImageRef.current) {
            const { id } = resizingImageRef.current
            const img = imagesRef.current.find(i => i.id === id)
            if (img) {
                setCanvasData(prev => prev.map(item =>
                    item.id === id ? { ...item, width: img.width, height: img.height } : item
                ))
                
                // Finalize size to MongoDB
                const socket = getSocket()
                if (socket?.connected) {
                    socket.emit('finalize-image-size', { 
                        roomId: ROOM_ID, 
                        imageId: id, 
                        newWidth: img.width, 
                        newHeight: img.height 
                    })
                }
            }
            resizingImageRef.current = null
            return
        }
        // Release drag and sync to canvasData + finalize to DB
        if (draggingImageRef.current) {
            const { id } = draggingImageRef.current
            const img = imagesRef.current.find(i => i.id === id)
            if (img) {
                setCanvasData(prev => prev.map(item =>
                    item.id === id ? { ...item, x: img.x, y: img.y } : item
                ))
                
                // Finalize position to MongoDB
                const socket = getSocket()
                if (socket?.connected) {
                    socket.emit('finalize-image-position', { 
                        roomId: ROOM_ID, 
                        imageId: id, 
                        newX: img.x, 
                        newY: img.y 
                    })
                }
            }
            draggingImageRef.current = null
            return
        }

        if (!isDrawingRef.current) return
        isDrawingRef.current = false
        setIsDrawing(false)
        canvasRef.current.getContext('2d').closePath()

        // Emit completed stroke to server and add to local canvasData
        if (currentStroke.current.length > 0) {
            const newStroke = {
                points: currentStroke.current,
                color,
                size: brushSize,
                userId: MY_USER_ID,
            }
            
            // Add to local canvasData immediately
            setCanvasData(prev => [...prev, newStroke])
            
            const socket = getSocket()
            if (socket?.connected) {
                socket.emit('draw-stroke', {
                    roomId: ROOM_ID,
                    stroke: newStroke,
                })
            }
            currentStroke.current = []
        }
    }

    // ── Toolbar actions ──────────────────────────────────────────────────
    const clearCanvas = () => {
        const socket = getSocket()
        if (!socket?.connected) return
        socket.emit('clear-board', { roomId: ROOM_ID })
        console.log('[Canvas] Emitted clear-board')
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

    // ── Image upload ──────────────────────────────────────────────────────────
    const handleImageUpload = (e) => {
        const file = e.target.files?.[0]
        if (!file) return
        // Reset so the same file can be re-selected if needed
        e.target.value = ''
        const reader = new FileReader()
        reader.onload = () => {
            const imageData = reader.result // base64 data URL
            const socket = getSocket()
            if (socket?.connected) {
                socket.emit('upload-image', { roomId: ROOM_ID, userId: MY_USER_ID, imageData })
                console.log('[Canvas] upload-image emitted')
            }
        }
        reader.readAsDataURL(file)
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
        <div style={{ position: 'relative', width: '100vw', height: '100vh', overflow: 'hidden', backgroundColor: 'var(--bg-color)' }}>
            
            {/* ── Top Glass Navigation Bar ── */}
            <div style={topNavStyle}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '1.5rem' }}>
                    <div style={roomIdStyle}>
                        <span style={{ fontSize: '0.75rem', opacity: 0.6 }}>Room</span>
                        <span style={{ fontWeight: 600, fontSize: '0.875rem' }}>{ROOM_ID}</span>
                    </div>
                    
                    {/* Online Users Dropdown */}
                    <div style={{ position: 'relative' }} data-users-dropdown>
                        <button 
                            onClick={() => setIsUsersDropdownOpen(!isUsersDropdownOpen)}
                            style={usersButtonStyle}
                        >
                            <span style={{ fontSize: '1rem' }}>👥</span>
                            <span style={{ fontWeight: 500 }}>{onlineUsers.length}</span>
                        </button>
                        
                        {isUsersDropdownOpen && (
                            <div style={usersDropdownStyle}>
                                <div style={{ padding: '0.5rem 0.75rem', fontSize: '0.75rem', fontWeight: 600, opacity: 0.6, borderBottom: '1px solid var(--border-color)' }}>
                                    ONLINE USERS
                                </div>
                                {onlineUsers.map(uid => {
                                    const isMe = uid === MY_USER_ID
                                    const userRole = isMe ? myRole : null
                                    return (
                                        <div key={uid} style={userDropdownItemStyle}>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flex: 1 }}>
                                                <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#10b981' }} />
                                                <span style={{ fontSize: '0.875rem', fontWeight: isMe ? 600 : 400 }}>
                                                    {isMe ? `${uid} (you)` : uid}
                                                </span>
                                            </div>
                                            {userRole === 'host' && (
                                                <span style={hostBadgeStyle}>Host</span>
                                            )}
                                        </div>
                                    )
                                })}
                                {onlineUsers.length === 0 && (
                                    <div style={{ padding: '1rem', textAlign: 'center', fontSize: '0.875rem', opacity: 0.5 }}>
                                        No users online
                                    </div>
                                )}
                            </div>
                        )}
                    </div>
                    
                    {/* Role Badge */}
                    <div style={modernRoleBadgeStyle(myRole)}>
                        {myRole === 'host' ? '👑 Host' : myRole === 'editor' ? '✏️ Editor' : myRole === 'viewer' ? '👁️ Viewer' : '⋯'}
                    </div>
                </div>
                
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                    {/* Theme Toggle */}
                    <button onClick={toggleTheme} style={modernIconButtonStyle} title={`Switch to ${theme === 'light' ? 'dark' : 'light'} mode`}>
                        {theme === 'light' ? '🌙' : '☀️'}
                    </button>
                    
                    {/* Leave Button */}
                    <button 
                        onClick={() => navigate('/dashboard')}
                        style={leaveButtonStyle} 
                        title="Leave room"
                    >
                        Leave
                    </button>
                </div>
            </div>

            {/* ── Floating Tool Dock (Left Side) ── */}
            <div style={toolDockStyle}>
                <button 
                    onClick={() => setActiveTool('pencil')}
                    style={{...toolButtonStyle, ...(activeTool === 'pencil' ? activeToolStyle : {})}}
                    title="Pencil"
                >
                    ✏️
                </button>
                
                <button 
                    onClick={() => setActiveTool('eraser')}
                    style={{...toolButtonStyle, ...(activeTool === 'eraser' ? activeToolStyle : {})}}
                    title="Eraser"
                >
                    🧹
                </button>
                
                <div style={{ height: '1px', background: 'var(--border-color)', margin: '0.5rem 0' }} />
                
                <button 
                    onClick={() => {
                        setActiveTool('image')
                        imageInputRef.current?.click()
                    }}
                    style={{...toolButtonStyle, ...(activeTool === 'image' ? activeToolStyle : {})}}
                    title="Upload Image"
                >
                    🖼️
                </button>
                <input
                    ref={imageInputRef}
                    type="file"
                    accept="image/*"
                    style={{ display: 'none' }}
                    onChange={handleImageUpload}
                />
                
                <div style={{ height: '1px', background: 'var(--border-color)', margin: '0.5rem 0' }} />
                
                <button onClick={handleUndo} style={toolButtonStyle} title="Undo">
                    ↩️
                </button>
                
                <button onClick={handleRedo} style={toolButtonStyle} title="Redo">
                    ↪️
                </button>
                
                <div style={{ height: '1px', background: 'var(--border-color)', margin: '0.5rem 0' }} />
                
                <button 
                    onClick={clearCanvas}
                    disabled={myRole !== 'host'}
                    style={{...toolButtonStyle, opacity: myRole !== 'host' ? 0.3 : 1}}
                    title={myRole !== 'host' ? 'Only host can clear' : 'Clear Canvas'}
                >
                    🗑️
                </button>
            </div>

            {/* ── Floating Properties Panel (Bottom Center) ── */}
            <div style={propertiesPanelStyle}>
                <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <span style={{ fontSize: '0.75rem', fontWeight: 500 }}>Color</span>
                    <input 
                        type="color" 
                        value={color}
                        onChange={(e) => setColor(e.target.value)}
                        style={{ width: '32px', height: '32px', border: 'none', borderRadius: '6px', cursor: 'pointer' }} 
                    />
                </label>
                
                <div style={{ width: '1px', height: '24px', background: 'var(--border-color)' }} />
                
                <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <span style={{ fontSize: '0.75rem', fontWeight: 500 }}>Size</span>
                    <input 
                        type="range" 
                        min={1} 
                        max={30} 
                        value={brushSize}
                        onChange={(e) => setBrushSize(Number(e.target.value))}
                        style={{ width: '100px' }} 
                    />
                    <span style={{ fontSize: '0.875rem', fontWeight: 600, minWidth: '2rem', textAlign: 'center' }}>{brushSize}</span>
                </label>
            </div>

            {/* ── Canvas Container ── */}
            <div style={{
                position: 'absolute',
                top: '64px',
                left: 0,
                right: 0,
                bottom: 0,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                padding: 0,
            }}>
                <canvas
                    ref={canvasRef}
                    style={{ 
                        display: 'block', 
                        cursor: isDrawing ? 'crosshair' : 'default', 
                        background: theme === 'dark' ? '#1a1a1a' : '#ffffff',
                        width: '100%',
                        height: '100%',
                    }}
                    onMouseDown={onMouseDown}
                    onMouseMove={onMouseMove}
                    onMouseUp={onMouseUp}
                    onMouseLeave={onMouseUp}
                />
            </div>

            {/* ── Floating Chat Button ── */}
            <button 
                onClick={() => setIsChatOpen(!isChatOpen)}
                style={chatFloatingButtonStyle}
                title={isChatOpen ? 'Close chat' : 'Open chat'}
            >
                💬
                {chatMessages.length > 0 && (
                    <span style={chatBadgeStyle}>{chatMessages.length}</span>
                )}
            </button>

            {/* ── Chat Slide-in Drawer ── */}
            <div style={{...chatDrawerStyle, right: isChatOpen ? 0 : '-340px'}}>
                <div style={chatDrawerHeaderStyle}>
                    <span style={{ fontWeight: 600, fontSize: '1rem' }}>💬 Chat</span>
                    <button onClick={() => setIsChatOpen(false)} style={closeButtonStyle}>
                        ✕
                    </button>
                </div>

                {/* Message list */}
                <div style={modernChatListStyle}>
                    {chatMessages.map((msg, i) => {
                        const isMe = msg.userId === MY_USER_ID
                        return (
                            <div key={msg._id ?? i} style={modernMsgWrapStyle(isMe)}>
                                {!isMe && (
                                    <div style={modernMsgUserStyle}>{msg.userId}</div>
                                )}
                                <div style={modernMsgBubbleStyle(isMe)}>{msg.message}</div>
                                <div style={modernMsgTimeStyle}>
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
                <div style={modernChatInputRowStyle}>
                    <input
                        value={chatInput}
                        onChange={e => setChatInput(e.target.value)}
                        onKeyDown={onChatKeyDown}
                        placeholder="Type a message…"
                        style={modernChatInputStyle}
                    />
                    <button onClick={sendMessage} style={modernChatSendBtnStyle}>
                        Send
                    </button>
                </div>
            </div>
        </div>
    )
}

// ── Modern Styles ─────────────────────────────────────────────────────────────

// Top Navigation Bar
const topNavStyle = {
    position: 'absolute', top: 0, left: 0, right: 0,
    height: '64px', display: 'flex', alignItems: 'center',
    justifyContent: 'space-between', padding: '0 1.5rem',
    backgroundColor: 'var(--panel-color)', backdropFilter: 'blur(10px)',
    borderBottom: '1px solid var(--border-color)',
    boxShadow: 'var(--shadow-sm)', zIndex: 50,
}

const roomIdStyle = {
    display: 'flex', flexDirection: 'column', gap: '0.125rem',
}

const usersButtonStyle = {
    display: 'flex', alignItems: 'center', gap: '0.5rem',
    padding: '0.5rem 0.75rem', borderRadius: '8px',
    border: '1px solid var(--border-color)',
    backgroundColor: 'var(--panel-color)', color: 'var(--text-color)',
    cursor: 'pointer', fontSize: '0.875rem',
    transition: 'all 0.2s ease',
    boxShadow: 'var(--shadow-sm)',
    ':hover': {
        transform: 'translateY(-1px)',
        boxShadow: 'var(--shadow-md)',
    }
}

const usersDropdownStyle = {
    position: 'absolute', top: 'calc(100% + 0.5rem)', left: 0,
    width: '240px', maxHeight: '300px', overflowY: 'auto',
    backgroundColor: 'var(--panel-color)', borderRadius: '12px',
    border: '1px solid var(--border-color)',
    boxShadow: 'var(--shadow-lg)', zIndex: 100,
}

const userDropdownItemStyle = {
    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
    padding: '0.75rem', borderBottom: '1px solid var(--border-color)',
    transition: 'background-color 0.2s ease',
}

const hostBadgeStyle = {
    padding: '0.25rem 0.5rem', borderRadius: '999px',
    fontSize: '0.625rem', fontWeight: 600,
    backgroundColor: '#ef4444', color: '#fff',
}

const modernRoleBadgeStyle = (role) => ({
    padding: '0.375rem 0.75rem', borderRadius: '8px',
    fontSize: '0.75rem', fontWeight: 600,
    backgroundColor: role === 'host' ? '#ef4444' : role === 'editor' ? 'var(--accent-color)' : '#64748b',
    color: '#fff',
})

const modernIconButtonStyle = {
    width: '40px', height: '40px', borderRadius: '8px',
    border: '1px solid var(--border-color)',
    backgroundColor: 'var(--panel-color)', color: 'var(--text-color)',
    cursor: 'pointer', fontSize: '1.25rem',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    transition: 'all 0.2s ease',
    boxShadow: 'var(--shadow-sm)',
}

const leaveButtonStyle = {
    padding: '0.5rem 1rem', borderRadius: '8px',
    border: '1px solid var(--border-color)',
    backgroundColor: '#ef4444', color: '#fff',
    cursor: 'pointer', fontSize: '0.875rem', fontWeight: 600,
    transition: 'all 0.2s ease',
    boxShadow: 'var(--shadow-sm)',
}

// Tool Dock
const toolDockStyle = {
    position: 'absolute', left: '1.5rem', top: '50%',
    transform: 'translateY(-50%)',
    display: 'flex', flexDirection: 'column', gap: '0.5rem',
    padding: '0.75rem', borderRadius: '12px',
    backgroundColor: 'var(--panel-color)', backdropFilter: 'blur(10px)',
    border: '1px solid var(--border-color)',
    boxShadow: 'var(--shadow-lg)', zIndex: 40,
}

const toolButtonStyle = {
    width: '48px', height: '48px', borderRadius: '8px',
    border: 'none', backgroundColor: 'transparent',
    color: 'var(--text-color)', cursor: 'pointer',
    fontSize: '1.5rem', display: 'flex', alignItems: 'center',
    justifyContent: 'center', transition: 'all 0.2s ease',
}

const activeToolStyle = {
    backgroundColor: 'var(--accent-color)', color: '#fff',
    transform: 'scale(1.05)',
}

// Properties Panel
const propertiesPanelStyle = {
    position: 'absolute', bottom: '1.5rem', left: '50%',
    transform: 'translateX(-50%)',
    display: 'flex', alignItems: 'center', gap: '1.5rem',
    padding: '0.75rem 1.5rem', borderRadius: '12px',
    backgroundColor: 'var(--panel-color)', backdropFilter: 'blur(10px)',
    border: '1px solid var(--border-color)',
    boxShadow: 'var(--shadow-lg)', zIndex: 30,
}

// Chat Floating Button
const chatFloatingButtonStyle = {
    position: 'absolute', bottom: '2rem', right: '2rem',
    width: '56px', height: '56px', borderRadius: '50%',
    border: 'none', backgroundColor: 'var(--accent-color)',
    color: '#fff', cursor: 'pointer', fontSize: '1.5rem',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    boxShadow: 'var(--shadow-lg)', zIndex: 40,
    transition: 'all 0.2s ease',
}

const chatBadgeStyle = {
    position: 'absolute', top: '-4px', right: '-4px',
    width: '20px', height: '20px', borderRadius: '50%',
    backgroundColor: '#ef4444', color: '#fff',
    fontSize: '0.625rem', fontWeight: 600,
    display: 'flex', alignItems: 'center', justifyContent: 'center',
}

// Chat Drawer
const chatDrawerStyle = {
    position: 'absolute', top: 0, width: '340px', height: '100vh',
    display: 'flex', flexDirection: 'column',
    backgroundColor: 'var(--panel-color)', backdropFilter: 'blur(10px)',
    borderLeft: '1px solid var(--border-color)',
    boxShadow: 'var(--shadow-lg)', zIndex: 50,
    transition: 'right 0.3s ease',
}

const chatDrawerHeaderStyle = {
    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
    padding: '1rem 1.25rem', borderBottom: '1px solid var(--border-color)',
}

const closeButtonStyle = {
    width: '32px', height: '32px', borderRadius: '6px',
    border: 'none', backgroundColor: 'transparent',
    color: 'var(--text-color)', cursor: 'pointer',
    fontSize: '1.25rem', display: 'flex', alignItems: 'center',
    justifyContent: 'center', transition: 'all 0.2s ease',
}

const modernChatListStyle = {
    flex: 1, overflowY: 'auto', padding: '1rem',
    display: 'flex', flexDirection: 'column', gap: '0.75rem',
}

const modernMsgWrapStyle = (isMe) => ({
    display: 'flex', flexDirection: 'column',
    alignItems: isMe ? 'flex-end' : 'flex-start',
})

const modernMsgUserStyle = {
    fontSize: '0.75rem', fontWeight: 500, opacity: 0.6,
    marginBottom: '0.25rem', paddingLeft: '0.5rem',
}

const modernMsgBubbleStyle = (isMe) => ({
    maxWidth: '85%', padding: '0.625rem 0.875rem',
    borderRadius: isMe ? '12px 12px 2px 12px' : '12px 12px 12px 2px',
    backgroundColor: isMe ? 'var(--accent-color)' : 'rgba(100, 116, 139, 0.1)',
    color: isMe ? '#fff' : 'var(--text-color)',
    fontSize: '0.875rem', lineHeight: 1.5, wordBreak: 'break-word',
})

const modernMsgTimeStyle = {
    fontSize: '0.625rem', opacity: 0.5,
    marginTop: '0.25rem', paddingRight: '0.5rem',
}

const modernChatInputRowStyle = {
    display: 'flex', gap: '0.5rem', padding: '1rem 1.25rem',
    borderTop: '1px solid var(--border-color)',
}

const modernChatInputStyle = {
    flex: 1, padding: '0.625rem 0.875rem', borderRadius: '8px',
    border: '1px solid var(--border-color)',
    backgroundColor: 'var(--bg-color)', color: 'var(--text-color)',
    fontSize: '0.875rem', outline: 'none', fontFamily: 'inherit',
    transition: 'all 0.2s ease',
}

const modernChatSendBtnStyle = {
    padding: '0.625rem 1.25rem', borderRadius: '8px',
    border: 'none', backgroundColor: 'var(--accent-color)',
    color: '#fff', cursor: 'pointer',
    fontSize: '0.875rem', fontWeight: 600,
    transition: 'all 0.2s ease',
}

export default Whiteboard
