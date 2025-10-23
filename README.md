# 🎨 Suspixels

A real-time collaborative pixel art canvas built with NestJS, WebSockets, PostgreSQL, and Redis.

![Version](https://img.shields.io/badge/version-1.0.0-blue)
![Node](https://img.shields.io/badge/node-23.9.0-green)
![NestJS](https://img.shields.io/badge/nestjs-11.0.7-red)
![License](https://img.shields.io/badge/license-UNLICENSED-lightgrey)

## ✨ Features

### 🎮 Core Features
- **Real-time collaboration** - See other users' pixels appear instantly via WebSockets
- **Massive canvas** - 3000x3000 pixel grid
- **Persistent storage** - All pixels saved to PostgreSQL with Redis caching
- **User tracking** - See how many users are online
- **Leaderboard** - View top contributors

### ✏️ Edit Mode (New!)
- **Explore Mode** (Default) - Browse the canvas without accidentally editing
- **Edit Mode** - Make changes with preview before applying
- **Pending changes preview** - See your changes with gold borders
- **Batch operations** - Make multiple edits and apply all at once
- **Discard functionality** - Cancel all changes before publishing
- **Confirmation prompts** - Prevents losing unsaved work

### 🎨 Drawing Tools
- **Color picker** - Choose any color with hex input
- **Eyedropper tool** - Pick colors from existing pixels
- **Eraser** - Remove pixels
- **Pan & zoom** - Navigate the large canvas
- **Touch support** - Full mobile compatibility

### 🏗️ Production Ready
- **Docker Compose** - One-command deployment
- **Health checks** - Monitor service status
- **CORS configured** - Works locally and in production
- **Multi-stage builds** - Optimized Docker images
- **Auto-restart** - Services recover automatically
- **Batch API** - Optimized bulk operations (10x faster applies)
- **Environment-based logging** - Debug logs in development, clean in production

## 🚀 Quick Start

### Prerequisites
- Docker & Docker Compose
- Node.js 23.9.0+ (if running locally)

### Using Docker (Recommended)

1. **Clone the repository:**
   ```bash
   git clone <your-repo-url>
   cd suspixels
   ```

2. **Create environment file:**
   ```bash
   cp env.sample .env
   ```

3. **Start the application:**
   ```bash
   docker compose up --build
   ```

4. **Access the app:**
   - Frontend: http://localhost:8000
   - API: http://localhost:3002
   - API Docs: http://localhost:3002/api
   - Health Check: http://localhost:3002/health

That's it! 🎉

### Local Development (Without Docker)

1. **Setup PostgreSQL:**
   ```bash
   docker run --name pixel_canvas \
     -e POSTGRES_USER=postgres \
     -e POSTGRES_PASSWORD=your_password_here \
     -e POSTGRES_DB=pixel_canvas \
     -p 5432:5432 -d postgres
   ```

2. **Setup Redis:**
   ```bash
   docker run -d --name redis-pixels -p 6379:6379 redis
   ```

3. **Configure environment:**
   ```bash
   cp env.sample .env
   # Edit .env with your database credentials
   ```

4. **Install dependencies:**
   ```bash
   npm install
   ```

5. **Start the application:**
   ```bash
   npm run start:dev:full
   ```

## 📖 How to Use

### Basic Usage

1. **Enter your name** when prompted
2. Start in **Explore Mode** to view the canvas
3. Use mouse wheel or pinch to zoom
4. Click and drag to pan around

### Using Edit Mode

1. Click the **"Explore Mode"** button in the header
2. Button turns green and shows **"Edit Mode"**
3. Select a color from the palette
4. Click on the canvas to place pixels
5. Your changes show with **gold borders**
6. See pending changes count in the toolbar
7. Click **"Apply"** to save changes to the server
8. Click **"Discard"** to cancel all pending changes

### Tools

- **Color Picker** - Click the palette icon to choose any color
- **Eyedropper** - Click the eyedropper icon, then click a pixel to copy its color
- **Eraser** - Toggle to remove pixels
- **Leaderboard** - View top contributors

## 🏗️ Architecture

### Backend (NestJS)
- **REST API** - Pixel CRUD operations
- **WebSocket Gateway** - Real-time pixel updates
- **PostgreSQL** - Persistent storage
- **Redis** - Caching and batching
- **TypeORM** - Database ORM
- **Swagger** - API documentation

### Frontend (Vanilla JS)
- **Canvas API** - Rendering engine
- **WebSocket Client** - Real-time updates
- **LocalStorage** - User preferences and pending changes
- **Responsive Design** - Works on all devices

### Caching Strategy
- **Write-through cache** - Pixels written to Redis first, batched to database
- **30-second batch processing** - Reduces database load
- **Read-through cache** - Fast pixel loading

## 🔧 Configuration

### Environment Variables

```env
# Application
NODE_ENV=development  # or 'production'
APP_PORT=3002
APP_CORS_ORIGINS=  # Comma-separated origins or empty for all

# Database
DATABASE_HOST=localhost
DATABASE_PORT=5432
DATABASE_USERNAME=postgres
DATABASE_PASSWORD=your_password_here
DATABASE_NAME=pixel_canvas
DATABASE_SYNCHRONIZE=false  # false in production!

# Redis
REDIS_HOST=localhost
REDIS_PORT=6379
```

### Docker Compose Services

- **api** - NestJS backend (ports 3002, 8000)
- **postgres** - PostgreSQL database (port 5432)
- **redis** - Redis cache (port 6379)

All services have health checks and auto-restart configured.

## 📊 API Endpoints

### REST API

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/pixels` | Get all pixels |
| POST | `/api/pixels` | Create/update a pixel |
| POST | `/api/pixels/batch` | **Batch** create/update/delete pixels |
| DELETE | `/api/pixels` | Delete a pixel |
| GET | `/api/pixels/leaderboard` | Get top contributors |
| GET | `/health` | Health check |

### WebSocket Events

| Event | Direction | Description |
|-------|-----------|-------------|
| `pixel_update` | Server → Client | New pixel placed |
| `pixel_delete` | Server → Client | Pixel removed |
| `user_count` | Server → Client | Online user count |

## 🚀 Deployment

See [DEPLOYMENT.md](./DEPLOYMENT.md) for detailed deployment instructions including:
- Production environment setup
- VM deployment guide
- Nginx reverse proxy configuration
- SSL/TLS setup
- Monitoring and troubleshooting
- Backup and restore procedures

### Quick Production Deploy

1. Update `.env` with production values
2. Set `DATABASE_SYNCHRONIZE=false`
3. Run `docker compose up -d --build`
4. Setup reverse proxy (Nginx/Caddy)
5. Configure SSL

## 🔒 Security

- ✅ CORS properly configured
- ✅ Environment variables for sensitive data
- ✅ Health check endpoints
- ✅ No credentials in code
- ⚠️ Add authentication for production use
- ⚠️ Add rate limiting for API endpoints
- ⚠️ Use HTTPS/WSS in production

## 🎯 Roadmap

- [ ] User authentication
- [ ] Rate limiting
- [ ] Undo/redo functionality
- [ ] Canvas layers
- [ ] Pixel history
- [ ] Export/import canvas
- [ ] Drawing shapes/lines
- [ ] Multiple canvas support

## 🛠️ Tech Stack

### Backend
- **NestJS** - Progressive Node.js framework
- **TypeScript** - Type safety
- **PostgreSQL** - Relational database
- **Redis** - In-memory cache
- **TypeORM** - ORM
- **WebSockets (ws)** - Real-time communication
- **Swagger** - API documentation

### Frontend
- **Vanilla JavaScript** - No framework overhead
- **HTML5 Canvas** - High-performance rendering
- **WebSocket API** - Real-time updates
- **CSS3** - Modern styling
- **Font Awesome** - Icons

### DevOps
- **Docker** - Containerization
- **Docker Compose** - Multi-container orchestration
- **Multi-stage builds** - Optimized images
- **Health checks** - Service monitoring

## 📝 Development

### Project Structure

```
suspixels/
├── src/
│   ├── config/         # App configuration
│   ├── database/       # Database module
│   ├── pixels/         # Pixels feature module
│   │   ├── dto/        # Data transfer objects
│   │   ├── entities/   # Database entities
│   │   └── ...
│   ├── redis/          # Redis module
│   └── main.ts         # Application entry
├── frontend/           # Static frontend files
│   ├── index.html
│   ├── script.js
│   └── style.css
├── docker-compose.yml
├── Dockerfile
└── ...
```

### Available Scripts

```bash
# Development
npm run start:dev       # Start backend with watch mode
npm run start:dev:full  # Start backend + frontend

# Production
npm run build           # Build the application
npm run start:prod      # Start production backend
npm run start:prod:full # Start production backend + frontend

# Testing
npm run test            # Run unit tests
npm run test:e2e        # Run e2e tests

# Linting
npm run lint            # Lint and fix
```

### Adding New Features

1. Generate module: `nest g module feature-name`
2. Generate controller: `nest g controller feature-name`
3. Generate service: `nest g service feature-name`
4. Add DTOs, entities, and tests

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests
5. Submit a pull request

## 📄 License

This project is UNLICENSED.

## 🙋 Support

For issues and questions:
- Check [DEPLOYMENT.md](./DEPLOYMENT.md) for deployment issues
- Review logs: `docker compose logs -f`
- Check health endpoint: http://localhost:3002/health

## 🎨 Credits

Inspired by r/place and similar collaborative pixel art projects.

---

Built with ❤️ using NestJS, PostgreSQL, Redis, and WebSockets.
