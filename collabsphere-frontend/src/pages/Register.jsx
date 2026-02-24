import { useState } from 'react'
import { useNavigate, Link } from 'react-router-dom'

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000'

function Register() {
    const [name, setName] = useState('')
    const [email, setEmail] = useState('')
    const [password, setPassword] = useState('')
    const [error, setError] = useState('')
    const [loading, setLoading] = useState(false)
    const navigate = useNavigate()

    const handleSubmit = async (e) => {
        e.preventDefault()
        setError('')
        setLoading(true)

        try {
            const response = await fetch(`${API_URL}/api/auth/register`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ name, email, password }),
            })

            const data = await response.json()

            if (!response.ok) {
                throw new Error(data.message || 'Registration failed')
            }

            // Redirect to login page
            navigate('/login', { state: { message: 'Registration successful! Please login.' } })
        } catch (err) {
            setError(err.message)
        } finally {
            setLoading(false)
        }
    }

    return (
        <div style={containerStyle}>
            <div style={cardStyle}>
                <h1 style={titleStyle}>CollabSphere</h1>
                <p style={subtitleStyle}>Create your account</p>

                {error && (
                    <div style={errorStyle}>
                        {error}
                    </div>
                )}

                <form onSubmit={handleSubmit} style={formStyle}>
                    <div style={fieldStyle}>
                        <label style={labelStyle}>Name</label>
                        <input
                            type="text"
                            value={name}
                            onChange={(e) => setName(e.target.value)}
                            required
                            style={inputStyle}
                            placeholder="John Doe"
                        />
                    </div>

                    <div style={fieldStyle}>
                        <label style={labelStyle}>Email</label>
                        <input
                            type="email"
                            value={email}
                            onChange={(e) => setEmail(e.target.value)}
                            required
                            style={inputStyle}
                            placeholder="you@example.com"
                        />
                    </div>

                    <div style={fieldStyle}>
                        <label style={labelStyle}>Password</label>
                        <input
                            type="password"
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            required
                            minLength={6}
                            style={inputStyle}
                            placeholder="••••••••"
                        />
                    </div>

                    <button
                        type="submit"
                        disabled={loading}
                        style={{
                            ...buttonStyle,
                            opacity: loading ? 0.6 : 1,
                            cursor: loading ? 'not-allowed' : 'pointer',
                        }}
                    >
                        {loading ? 'Creating account...' : 'Sign up'}
                    </button>
                </form>

                <p style={linkTextStyle}>
                    Already have an account?{' '}
                    <Link to="/login" style={linkStyle}>
                        Sign in
                    </Link>
                </p>
            </div>
        </div>
    )
}

// Styles (same as Login)
const containerStyle = {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: '100vh',
    backgroundColor: 'var(--bg-color)',
    padding: '1rem',
}

const cardStyle = {
    width: '100%',
    maxWidth: '400px',
    padding: '2rem',
    backgroundColor: 'var(--panel-color)',
    borderRadius: '12px',
    border: '1px solid var(--border-color)',
    boxShadow: 'var(--shadow-lg)',
}

const titleStyle = {
    fontSize: '1.875rem',
    fontWeight: 700,
    color: 'var(--text-color)',
    marginBottom: '0.5rem',
    textAlign: 'center',
}

const subtitleStyle = {
    fontSize: '0.875rem',
    color: 'var(--text-color)',
    opacity: 0.6,
    marginBottom: '2rem',
    textAlign: 'center',
}

const errorStyle = {
    padding: '0.75rem',
    backgroundColor: '#fee',
    color: '#c00',
    borderRadius: '8px',
    fontSize: '0.875rem',
    marginBottom: '1rem',
    border: '1px solid #fcc',
}

const formStyle = {
    display: 'flex',
    flexDirection: 'column',
    gap: '1.25rem',
}

const fieldStyle = {
    display: 'flex',
    flexDirection: 'column',
    gap: '0.5rem',
}

const labelStyle = {
    fontSize: '0.875rem',
    fontWeight: 500,
    color: 'var(--text-color)',
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

const buttonStyle = {
    padding: '0.75rem',
    borderRadius: '8px',
    border: 'none',
    backgroundColor: 'var(--accent-color)',
    color: '#fff',
    fontSize: '0.875rem',
    fontWeight: 600,
    cursor: 'pointer',
    transition: 'all 0.2s ease',
}

const linkTextStyle = {
    marginTop: '1.5rem',
    textAlign: 'center',
    fontSize: '0.875rem',
    color: 'var(--text-color)',
    opacity: 0.7,
}

const linkStyle = {
    color: 'var(--accent-color)',
    textDecoration: 'none',
    fontWeight: 600,
}

export default Register
