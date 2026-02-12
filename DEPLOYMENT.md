# Suspixels Deployment Guide

## Overview
This guide will help you deploy Suspixels in both local and production environments.

## Production Ready Features

### ✅ Completed
- WebSocket CORS configuration for local and production
- Health check endpoint at `/health`
- Docker compose with health checks
- Production-ready environment configuration
- Edit mode with explore/edit toggle
- Pending changes with apply/discard functionality
- Visual preview of pending changes (gold borders)

## Local Development Setup

### Prerequisites
- Docker and Docker Compose
- Node.js 23.x (if running without Docker)

### Steps

1. **Copy the environment file:**
   ```bash
   cp env.sample .env
   ```

2. **Update the `.env` file for local development:**
   ```env
   APP_PORT=3002
   APP_CORS_ORIGINS=http://localhost:8000,http://localhost:3000
   DATABASE_HOST=localhost
   DATABASE_PORT=5432
   DATABASE_USERNAME=postgres
   DATABASE_PASSWORD=your_secure_password
   DATABASE_NAME=pixel_canvas
   DATABASE_SYNCHRONIZE=true
   REDIS_HOST=localhost
   REDIS_PORT=6379
   ```

3. **Start the application:**
   ```bash
   docker compose up --build
   ```

4. **Access the application:**
   - Frontend: http://localhost:8000
   - API: http://localhost:3002
   - Swagger API Docs: http://localhost:3002/api
   - Health Check: http://localhost:3002/health

## Production Deployment

### Environment Setup

1. **Create/update `.env` file for production:**
   ```env
   APP_PORT=3002
   # Leave empty to allow all origins, or specify your domain
   APP_CORS_ORIGINS=https://yourdomain.com
   DATABASE_HOST=postgres
   DATABASE_PORT=5432
   DATABASE_USERNAME=postgres
   DATABASE_PASSWORD=<strong_password_here>
   DATABASE_NAME=pixel_canvas
   # Important: Set to false in production!
   DATABASE_SYNCHRONIZE=true
   REDIS_HOST=redis
   REDIS_PORT=6379
   ```

2. **Important Production Settings:**
   - Set `DATABASE_SYNCHRONIZE=true` (tables created automatically)
   - Use strong passwords
   - Configure proper CORS origins
   - Use HTTPS/WSS in production

### Docker Compose Deployment

The `docker-compose.yml` is already configured for production with:
- Health checks for all services
- Automatic restart policies
- Persistent volumes for data
- Multi-stage Docker builds

**Deploy:**
```bash
docker compose up -d --build
```

**Check health:**
```bash
docker compose ps
curl http://localhost:3002/health
```

### VM Deployment

1. **Install Docker and Docker Compose on your VM:**
   ```bash
   curl -fsSL https://get.docker.com -o get-docker.sh
   sudo sh get-docker.sh
   sudo apt-get install docker-compose-plugin
   ```

2. **Clone the repository:**
   ```bash
   git clone <your-repo-url>
   cd suspixels
   ```

3. **Configure environment:**
   ```bash
   cp env.sample .env
   nano .env  # Edit with your production values
   ```

4. **Deploy:**
   ```bash
   docker compose up -d --build
   ```

5. **Setup reverse proxy (Nginx example):**
   ```nginx
   server {
       listen 80;
       server_name yourdomain.com;

       location / {
           proxy_pass http://localhost:8000;
           proxy_http_version 1.1;
           proxy_set_header Upgrade $http_upgrade;
           proxy_set_header Connection 'upgrade';
           proxy_set_header Host $host;
           proxy_cache_bypass $http_upgrade;
       }

       location /api {
           proxy_pass http://localhost:3002;
           proxy_http_version 1.1;
           proxy_set_header Upgrade $http_upgrade;
           proxy_set_header Connection 'upgrade';
           proxy_set_header Host $host;
           proxy_cache_bypass $http_upgrade;
       }

       # WebSocket support
       location ~ ^/(socket\.io|ws) {
           proxy_pass http://localhost:3002;
           proxy_http_version 1.1;
           proxy_set_header Upgrade $http_upgrade;
           proxy_set_header Connection "Upgrade";
           proxy_set_header Host $host;
       }
   }
   ```

6. **Setup SSL with Let's Encrypt:**
   ```bash
   sudo apt-get install certbot python3-certbot-nginx
   sudo certbot --nginx -d yourdomain.com
   ```

## Features Guide

### Edit Mode

The app now has two modes:

#### 🔍 Explore Mode (Default)
- View the pixel canvas
- Navigate and zoom
- See other users' changes in real-time
- **Cannot place or edit pixels**

#### ✏️ Edit Mode
- Click the "Explore Mode" button to switch to "Edit Mode"
- Place pixels with selected color
- Use eraser tool to remove pixels
- **Changes are stored locally** until applied
- Preview changes with **gold borders**
- See pending changes count
- **Apply** to save all changes to server
- **Discard** to cancel all changes

### How to Use Edit Mode

1. Click the **"Explore Mode"** button in the header (it will turn green and say "Edit Mode")
2. Select a color using the color picker or palette
3. Click on the canvas to place pixels
4. Use the eraser tool to remove pixels
5. You'll see your changes with gold borders
6. The pending changes count shows how many edits you've made
7. Click **"Apply"** to save all changes to the server
8. Click **"Discard"** to cancel all pending changes
9. If you try to exit edit mode with unsaved changes, you'll get a confirmation prompt

### Benefits of Edit Mode

- **Preview before publishing**: See all your changes before committing
- **Batch operations**: Make multiple changes and apply them all at once
- **Undo-friendly**: Discard all changes if you're not happy
- **No accidental edits**: Explore mode prevents accidental pixel placement

## Monitoring

### Health Checks
- Endpoint: `GET /health`
- Returns: `{ status: 'ok', timestamp: ISO8601, uptime: seconds }`

### Docker Health Status
```bash
docker compose ps
```

### View Logs
```bash
docker compose logs -f api
docker compose logs -f postgres
docker compose logs -f redis
```

## Troubleshooting

### WebSocket Connection Issues

1. **Check CORS configuration:**
   - Ensure `APP_CORS_ORIGINS` in `.env` matches your frontend URL
   - For production, use your domain: `https://yourdomain.com`
   - For local, use: `http://localhost:8000`

2. **Check WebSocket URL in browser console:**
   - Open DevTools → Network → WS tab
   - Verify connection to correct WebSocket URL

3. **Firewall issues:**
   - Ensure ports 3002 and 8000 are open
   - Check cloud provider security groups

### Database Connection Issues

1. **Check if Postgres is running:**
   ```bash
   docker compose ps postgres
   ```

2. **Check database logs:**
   ```bash
   docker compose logs postgres
   ```

3. **Verify credentials in `.env`**

### Redis Connection Issues

1. **Check if Redis is running:**
   ```bash
   docker compose ps redis
   ```

2. **Test Redis connection:**
   ```bash
   docker compose exec redis redis-cli ping
   ```

## Performance Optimization

### For High Traffic

1. **Scale the API service:**
   ```bash
   docker compose up -d --scale api=3
   ```

2. **Use a load balancer** (Nginx, HAProxy)

3. **Increase database connections:**
   - Update `DATABASE_MAX_CONNECTIONS` in `.env`

4. **Configure Redis memory limits:**
   ```yaml
   redis:
     command: redis-server --maxmemory 2gb --maxmemory-policy allkeys-lru
   ```

## Backup and Restore

### Backup Database
```bash
docker compose exec postgres pg_dump -U postgres pixel_canvas > backup.sql
```

### Restore Database
```bash
cat backup.sql | docker compose exec -T postgres psql -U postgres pixel_canvas
```

## Security Recommendations

1. **Use strong passwords** for database
2. **Enable SSL/TLS** in production
3. **Configure proper CORS origins** (don't use `*` in production)
4. **Keep Docker images updated**
5. **Use environment variables** for sensitive data (never commit `.env`)
6. **Set up firewall rules** to restrict access
7. **Regular backups** of database

## Support

For issues and questions:
- Check the logs: `docker compose logs`
- Review environment configuration
- Verify network connectivity
- Check firewall rules

## License

[Your License Here]

