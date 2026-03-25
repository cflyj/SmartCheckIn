import express from 'express'
import cors from 'cors'
import { loadEnvFile } from 'node:process'
import { dirname, join } from 'path'
import { fileURLToPath } from 'url'
import { initDb } from './db.js'
import authRouter from './routes/auth.js'
import usersRouter from './routes/users.js'
import orgsRouter from './routes/orgs.js'
import sessionsRouter from './routes/sessions.js'

const __dirname = dirname(fileURLToPath(import.meta.url))
const rootDir = join(__dirname, '..')
try {
  loadEnvFile(join(rootDir, '.env'))
} catch (e) {
  if (e?.code !== 'ENOENT') throw e
}

const PORT = Number(process.env.API_PORT || process.env.PORT || 3001)

const app = express()
app.use(cors({ origin: true, credentials: true }))
app.use(express.json({ limit: '256kb' }))

app.get('/api/health', (_req, res) => {
  res.json({ ok: true, data: { status: 'ok' } })
})

app.use('/api/auth', authRouter)
app.use('/api/users', usersRouter)
app.use('/api/orgs', orgsRouter)
app.use('/api/sessions', sessionsRouter)

if (process.env.NODE_ENV === 'production') {
  const dist = join(__dirname, '../dist')
  app.use(express.static(dist))
  app.get(/^(?!\/api\/).*/, (_req, res) => {
    res.sendFile(join(dist, 'index.html'))
  })
}

app.use((_req, res) => {
  res.status(404).json({
    ok: false,
    error: { code: 'not_found', message: '接口不存在' },
  })
})

app.use((err, _req, res, _next) => {
  console.error(err)
  res.status(500).json({
    ok: false,
    error: { code: 'server_error', message: '服务异常' },
  })
})

initDb()
const server = app.listen(PORT, () => {
  console.log(`API http://127.0.0.1:${PORT}`)
})
server.on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    console.error(
      `[API] 端口 ${PORT} 已被占用。请结束占用该端口的进程，或改用其他端口：启动 API 前设置环境变量 API_PORT；Vite 代理会读取根目录 .env.development 等文件中的 API_PORT，请与 API 实际监听端口一致。`
    )
  } else {
    console.error(err)
  }
  process.exit(1)
})
