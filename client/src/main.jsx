import React from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import './styles.css'
import '@fortawesome/fontawesome-free/css/fontawesome.min.css'
import '@fortawesome/fontawesome-free/css/solid.min.css'
import logoUrl from './bildmarke.png'

// Ensure title and favicon reflect the app branding
try {
	if (document.title !== 'RIKER') document.title = 'RIKER'
	const link = document.querySelector('link#app-favicon') || document.querySelector('link[rel="icon"]')
	if (link && logoUrl) link.setAttribute('href', logoUrl)
} catch {}

createRoot(document.getElementById('root')).render(<App />)
