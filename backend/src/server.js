import app from './app.js'
import { attachLiveWebSocket } from './live.ws.js'

const PORT = process.env.PORT || 4000

const server = app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`)
})

// WebSocket Live (audio natif Gemini) sur le même port HTTP.
attachLiveWebSocket(server)
