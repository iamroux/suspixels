# Changelog

## [1.0.0] - 2025-10-23

### 🎉 Major Features Added

#### Edit Mode Feature
- **Explore Mode (Default)**: Browse the canvas without accidentally placing pixels
- **Edit Mode**: Toggle to enable pixel editing with preview functionality
- **Pending Changes Preview**: Visual feedback with gold borders on edited pixels
- **Batch Apply**: Apply all pending changes at once
- **Discard Changes**: Cancel all pending edits before saving
- **Change Counter**: See how many pending changes you have
- **Confirmation Prompts**: Warns before losing unsaved work

#### Production Readiness
- **Health Check Endpoint**: `/health` endpoint for monitoring
- **Docker Health Checks**: All services have health checks configured
- **CORS Fixed**: Proper WebSocket and HTTP CORS configuration for local and production
- **Environment Configuration**: Updated with production-ready defaults
- **Multi-stage Docker Builds**: Optimized container images
- **Auto-restart Policies**: Services automatically recover from failures

### 🔧 Technical Improvements

#### Backend Changes
- Added `ConfigService` injection to `WebsocketGateway`
- Enabled CORS for WebSocket connections with `cors: true`
- Added health check endpoint in `AppController`
- Updated `credentials: true` in CORS configuration for proper cookie handling
- Added wget to Docker image for health checks

#### Frontend Changes
- **New UI Components**:
  - Mode toggle button (Explore/Edit)
  - Pending changes counter
  - Apply/Discard action buttons
- **Edit Mode Logic**:
  - Local state management for pending changes
  - Original pixel state tracking for discard functionality
  - Visual preview with gold borders
  - Protected WebSocket updates during edit mode
- **Improved UX**:
  - Disabled tools in explore mode
  - Confirmation prompts for unsaved changes
  - Loading states for apply button
  - Success feedback after applying changes

#### Infrastructure Changes
- **Docker Compose**:
  - Added health checks for API service
  - Added `NODE_ENV=production` environment variable
  - Fixed port mappings with quotes
  - Added health check configuration with wget
- **Dockerfile**:
  - Added wget installation for health checks
  - Optimized multi-stage builds
- **Environment**:
  - Updated `env.sample` with better documentation
  - Set `DATABASE_SYNCHRONIZE=false` as default (safer for production)
  - Added CORS configuration examples

### 📱 Responsive Design
- Mobile-friendly edit mode UI
- Collapsible edit actions on mobile
- Hidden text labels on smaller screens
- Touch-friendly buttons

### 📚 Documentation
- **DEPLOYMENT.md**: Comprehensive deployment guide
  - Local and production setup instructions
  - VM deployment guide
  - Nginx reverse proxy configuration
  - SSL/TLS setup with Let's Encrypt
  - Troubleshooting section
  - Performance optimization tips
  - Backup and restore procedures
  - Security recommendations
- **README.md**: Complete project documentation
  - Feature list
  - Quick start guide
  - Usage instructions
  - Architecture overview
  - API documentation
  - Tech stack details
  - Development guide

### 🎨 UI/UX Improvements
- Visual distinction between explore and edit modes
- Color-coded mode toggle button (gray for explore, green for edit)
- Gold borders on pending changes for easy identification
- Real-time pending changes counter
- Smooth transitions and hover effects
- Disabled state styling for tools

### 🐛 Bug Fixes
- Fixed WebSocket CORS errors in production
- Fixed pixel updates overriding pending changes
- Fixed tool buttons enabled/disabled state management
- Fixed mobile layout issues with edit mode

### 🔒 Security Improvements
- Proper CORS configuration
- No hardcoded credentials
- Environment-based configuration
- Health check endpoint doesn't expose sensitive data
- Database synchronize disabled by default for production

### 🚀 Performance
- Batch pixel updates during apply
- No unnecessary re-renders
- Efficient pending changes tracking
- Redis caching maintained

## How to Update

If you're updating from a previous version:

1. **Pull the latest changes:**
   ```bash
   git pull origin main
   ```

2. **Update environment file:**
   ```bash
   cp env.sample .env.new
   # Review and merge changes into your .env
   ```

3. **Rebuild containers:**
   ```bash
   docker compose down
   docker compose up --build -d
   ```

4. **Verify health:**
   ```bash
   curl http://localhost:3002/health
   ```

## Breaking Changes

- None - fully backward compatible

## Known Issues

- None currently known

## Future Enhancements

- User authentication
- Rate limiting
- Undo/redo in edit mode
- Save edit sessions to local storage
- Keyboard shortcuts
- Drawing tools (line, rectangle, fill)
- Multiple canvases
- Pixel history view

---

**Contributors**: Your team
**Date**: October 23, 2025

