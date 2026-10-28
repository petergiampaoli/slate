import { createRoot } from 'react-dom/client'
import App from './App'
import 'katex/dist/katex.min.css'
import './styles/app.css'
import './styles/editor.css'
import './styles/markdown.css'
import './styles/canvas.css'
import './styles/studio.css'

const container = document.getElementById('root')
if (!container) throw new Error('Root element missing')

createRoot(container).render(<App />)
