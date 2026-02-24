import { createContext, useContext, useState, useEffect } from 'react'

const ThemeContext = createContext()

export const useTheme = () => {
    const context = useContext(ThemeContext)
    if (!context) {
        throw new Error('useTheme must be used within a ThemeProvider')
    }
    return context
}

export const ThemeProvider = ({ children }) => {
    // Initialize theme from localStorage or default to 'light'
    const [theme, setTheme] = useState(() => {
        const savedTheme = localStorage.getItem('collab_theme')
        return savedTheme === 'dark' ? 'dark' : 'light'
    })

    // Apply theme class to body element and save to localStorage
    useEffect(() => {
        localStorage.setItem('collab_theme', theme)
        
        // Remove both classes first, then add the current theme
        document.body.classList.remove('light', 'dark')
        document.body.classList.add(theme)
    }, [theme])

    const toggleTheme = () => {
        setTheme(prev => prev === 'light' ? 'dark' : 'light')
    }

    const value = {
        theme,
        toggleTheme,
    }

    return (
        <ThemeContext.Provider value={value}>
            {children}
        </ThemeContext.Provider>
    )
}
