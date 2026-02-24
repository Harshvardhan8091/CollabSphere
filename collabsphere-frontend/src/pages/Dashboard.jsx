import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { useTheme } from '../context/ThemeContext'

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000'

function Dashboard() {
    const [roomId, setRoomId] = useState('')
    const [loading, setLoading] = useState(false)
    const [error, setError] = useState('')
    const navigate = useNavigate()
    const { user, logout } = useAuth()
    const { theme, toggleTheme } = useTheme()

    const handleCreateRoom = async () => {
        setLoading(true)
        setError('')

        try {
            // Generate a unique room ID
            const newRoomId = 'room-' + Math.random().toString(36).slice(2, 10)
            
            // Navigate to whiteboard with the new room ID
            navigate(`/whiteboard/${newRoomId}`)
        } catch (err) {
            setError(err.message)
        } finally {
            setLoading(false)
        }
    }

    const handleJoinRoom = (e) => {
        e.preventDefault()
        if (!roomId.trim()) {
            setError('Please enter a room ID')
            return
        }
        navigate(`/whiteboard/${roomId.trim()}`)
    }

    const handleLogout = () => {
        logout()
        navigate('/login')
    }

    return (
        <div style={containerStyle}>
            {/* Top Navigation */}
            <div style={navStyle}>
                <div style={logoStyle}>CollabSphere</div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                    <div style={userInfoStyle}>
                        <span style={{ fontSize: '0.875rem', opacity: 0.7 }}>Welcome,</span>
                        <span style={{ fontSize: '0.875rem', fontWeight: 600 }}>{user?.name || user?.email}</span>
                    </div>
                    <button onClick={toggleTheme} style={iconButtonStyle} title={`Switch to ${theme === 'light' ? 'dark' : 'light'} mode`}>
                        {theme === 'light' ? '🌙' : '☀️'}
                    </button>
                    <button onClick={handleLogout} style={logoutButtonStyle}>
                        Logout
                    </button>
                </div>
            </div>

            {/* Main Content */}
            <div style={mainStyle}>
                <div style={heroStyle}>
                    <h1 style={heroTitleStyle}>Real-time Collaborative Whiteboard</h1>
                    <p style={heroSubtitleStyle}>
                        Create or join a room to start collaborating with your team
                    </p>
                </div>

                {error && (
                    <div style={errorStyle}>
                        {error}
                    </div>
                )}

                <div style={actionsContainerStyle}>
                    {/* Create Room Card */}
                    <div style={cardStyle}>
                        <div style={cardIconStyle}>🎨</div>
                        <h2 style={cardTitleStyle}>Create New Room</h2>
                        <p style={cardDescStyle}>
                            Start a new collaborative whiteboard session
                        </p>
                        <button
                            onClick={handleCreateRoom}
                            disabled={loading}
                            style={{
                                ...primaryButtonStyle,
                                opacity: loading ? 0.6 : 1,
                                cursor: loading ? 'not-allowed' : 'pointer',
                            }}
                        >
                            {loading ? 'Creating...' : 'Create Room'}
                        </button>
                    </div>

                    {/* Join Room Card */}
                    <div style={cardStyle}>
                        <div style={cardIconStyle}>🚪</div>
                        <h2 style={cardTitleStyle}>Join Existing Room</h2>
                        <p style={cardDescStyle}>
                            Enter a room ID to join a session
                        </p>
                        <form onSubmit={handleJoinRoom} style={formStyle}>
                            <input
                                type="text"
                                value={roomId}
                                onChange={(e) => setRoomId(e.target.value)}
                                placeholder="Enter room ID"
                                style={inputStyle}
                            />
                            <button type="submit" style={secondaryButtonStyle}>
                                Join Room
                            </button>
                        </form>
                    </div>
                </div>
            </div>
        </div>
    )
}

// Styles
const containerStyle = {
    minHeight: '100vh',
    backgroundColor: 'var(--bg-color)',
    display: 'flex',
    flexDirection: 'column',
}

const navStyle = {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '1rem 2rem',
    backgroundColor: 'var(--panel-color)',
    borderBottom: '1px solid var(--border-color)',
    boxShadow: 'var(--shadow-sm)',
}

const logoStyle = {
    fontSize: '1.5rem',
    fontWeight: 700,
    color: 'var(--text-color)',
}

const userInfoStyle = {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'flex-end',
    color: 'var(--text-color)',
}

const iconButtonStyle = {
    width: '40px',
    height: '40px',
    borderRadius: '8px',
    border: '1px solid var(--border-color)',
    backgroundColor: 'var(--panel-color)',
    color: 'var(--text-color)',
    cursor: 'pointer',
    fontSize: '1.25rem',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    transition: 'all 0.2s ease',
}

const logoutButtonStyle = {
    padding: '0.5rem 1rem',
    borderRadius: '8px',
    border: '1px solid var(--border-color)',
    backgroundColor: '#ef4444',
    color: '#fff',
    cursor: 'pointer',
    fontSize: '0.875rem',
    fontWeight: 600,
    transition: 'all 0.2s ease',
}

const mainStyle = {
    flex: 1,
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '2rem',
}

const heroStyle = {
    textAlign: 'center',
    marginBottom: '3rem',
}

const heroTitleStyle = {
    fontSize: '2.5rem',
    fontWeight: 700,
    color: 'var(--text-color)',
    marginBottom: '1rem',
}

const heroSubtitleStyle = {
    fontSize: '1.125rem',
    color: 'var(--text-color)',
    opacity: 0.7,
}

const errorStyle = {
    padding: '0.75rem 1rem',
    backgroundColor: '#fee',
    color: '#c00',
    borderRadius: '8px',
    fontSize: '0.875rem',
    marginBottom: '2rem',
    border: '1px solid #fcc',
    maxWidth: '600px',
}

const actionsContainerStyle = {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))',
    gap: '2rem',
    maxWidth: '800px',
    width: '100%',
}

const cardStyle = {
    padding: '2rem',
    backgroundColor: 'var(--panel-color)',
    borderRadius: '12px',
    border: '1px solid var(--border-color)',
    boxShadow: 'var(--shadow-md)',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    textAlign: 'center',
}

const cardIconStyle = {
    fontSize: '3rem',
    marginBottom: '1rem',
}

const cardTitleStyle = {
    fontSize: '1.5rem',
    fontWeight: 600,
    color: 'var(--text-color)',
    marginBottom: '0.5rem',
}

const cardDescStyle = {
    fontSize: '0.875rem',
    color: 'var(--text-color)',
    opacity: 0.7,
    marginBottom: '1.5rem',
}

const formStyle = {
    display: 'flex',
    flexDirection: 'column',
    gap: '0.75rem',
    width: '100%',
}

const inputStyle = {
    padding: '0.75rem',
    borderRadius: '8px',
    border: '1px solid var(--border-color)',
    backgroundColor: 'var(--bg-color)',
    color: 'var(--text-color)',
    fontSize: '0.875rem',
    outline: 'none',
    transition: 'all 0.2s ease',
}

const primaryButtonStyle = {
    padding: '0.75rem 1.5rem',
    borderRadius: '8px',
    border: 'none',
    backgroundColor: 'var(--accent-color)',
    color: '#fff',
    fontSize: '0.875rem',
    fontWeight: 600,
    cursor: 'pointer',
    transition: 'all 0.2s ease',
    width: '100%',
}

const secondaryButtonStyle = {
    padding: '0.75rem 1.5rem',
    borderRadius: '8px',
    border: '1px solid var(--border-color)',
    backgroundColor: 'var(--panel-color)',
    color: 'var(--text-color)',
    fontSize: '0.875rem',
    fontWeight: 600,
    cursor: 'pointer',
    transition: 'all 0.2s ease',
    width: '100%',
}

export default Dashboard
