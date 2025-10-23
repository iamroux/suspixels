# Testing Guide

This guide will help you test all the new features and verify the application is production-ready.

## 🧪 Testing Checklist

### 1. Initial Setup Test

```bash
# Make sure you're in the project directory
cd /home/sisyphus/Personal/Code/suspixels

# Build and start the application
docker compose down  # Stop any existing containers
docker compose up --build
```

**Expected Results:**
- ✅ All three services start (api, postgres, redis)
- ✅ Health checks pass (check `docker compose ps`)
- ✅ No errors in logs

### 2. Health Check Test

Open a new terminal and run:

```bash
# Test health endpoint
curl http://localhost:3002/health

# Should return something like:
# {
#   "status": "ok",
#   "timestamp": "2025-10-23T...",
#   "uptime": 123.45
# }
```

**Expected Results:**
- ✅ Returns JSON with status "ok"
- ✅ Includes timestamp and uptime

### 3. Frontend Access Test

1. Open browser to http://localhost:8000
2. Enter a username when prompted
3. Verify you see the canvas

**Expected Results:**
- ✅ Name modal appears
- ✅ Canvas loads after entering name
- ✅ "Explore Mode" button visible in header
- ✅ Tool buttons are disabled (grayed out)
- ✅ Can zoom and pan the canvas

### 4. WebSocket Connection Test

1. Check browser console (F12)
2. Look for WebSocket connection logs

**Expected Results:**
- ✅ "Connecting to WebSocket: ws://localhost:3002" message
- ✅ "WebSocket connected" message
- ✅ User count shows (e.g., "1 online")
- ✅ Connection status indicator is green

### 5. Edit Mode Toggle Test

1. Click the **"Explore Mode"** button in header
2. Observe the UI changes

**Expected Results:**
- ✅ Button turns green
- ✅ Text changes to "Edit Mode"
- ✅ Icon changes from eye to edit icon
- ✅ Tool buttons become enabled
- ✅ Edit actions bar appears below tools (Apply/Discard buttons)
- ✅ Shows "0 changes"

### 6. Pixel Placement Test

**In Edit Mode:**

1. Select a color (click palette icon)
2. Click on the canvas to place pixels
3. Observe the changes

**Expected Results:**
- ✅ Pixels appear with the selected color
- ✅ Pixels have **gold borders** (indicating pending changes)
- ✅ Pending changes counter updates (e.g., "3 changes")
- ✅ Apply and Discard buttons are enabled

### 7. Apply Changes Test

1. Place several pixels
2. Click the **"Apply"** button

**Expected Results:**
- ✅ Button shows "Applying..." with spinner
- ✅ After completion, shows "Applied!"
- ✅ Gold borders disappear from pixels
- ✅ Pending changes counter resets to "0 changes"
- ✅ Apply/Discard buttons become disabled
- ✅ Changes are visible (refresh page to verify they persisted)

### 8. Discard Changes Test

1. Place several pixels (don't apply)
2. Click the **"Discard"** button

**Expected Results:**
- ✅ All pending changes disappear immediately
- ✅ Pixels with gold borders are removed
- ✅ Pending changes counter resets to "0 changes"
- ✅ Canvas returns to state before edits

### 9. Exit Edit Mode with Unsaved Changes

1. Place some pixels
2. Click "Edit Mode" button to exit

**Expected Results:**
- ✅ Confirmation dialog appears: "You have unsaved changes. Do you want to discard them?"
- ✅ If "Cancel": stays in edit mode with changes preserved
- ✅ If "OK": exits to explore mode and discards changes

### 10. Eraser Tool Test

**In Edit Mode:**

1. Place some pixels and apply them
2. Enter edit mode again
3. Click the **Eraser** button
4. Click on existing pixels

**Expected Results:**
- ✅ Eraser button becomes active (darker background)
- ✅ Clicking pixels removes them
- ✅ Removed pixels show in pending changes
- ✅ Can apply or discard eraser changes

### 11. Color Picker Tool Test

1. In edit mode, click an existing pixel's color
2. Click the **eyedropper** icon
3. Click on a colored pixel

**Expected Results:**
- ✅ Mode changes to color picker (crosshair cursor)
- ✅ Clicking a pixel picks its color
- ✅ Selected color updates to picked color
- ✅ Message shows "Picked color: #RRGGBB"

### 12. Multi-User Test (Real-time Sync)

1. Open http://localhost:8000 in two different browsers/tabs
2. In one browser: Enter edit mode, place pixels, and apply
3. Watch the other browser

**Expected Results:**
- ✅ Both browsers show different user counts
- ✅ Pixels applied in one browser appear in the other **immediately**
- ✅ No delay or refresh needed

### 13. Leaderboard Test

1. Place and apply several pixels
2. Click the **Leaderboard** button in footer

**Expected Results:**
- ✅ Modal opens with leaderboard table
- ✅ Your username appears with pixel count
- ✅ Can close the modal

### 14. Mobile Responsive Test

1. Open browser DevTools
2. Toggle device toolbar (mobile view)
3. Test on different screen sizes

**Expected Results:**
- ✅ UI adapts to small screens
- ✅ Mode toggle shows only icon (no text)
- ✅ Edit actions stack vertically on mobile
- ✅ Touch gestures work (pan, zoom, tap to place)

### 15. Production Environment Test (Local)

1. Update `.env` file:
   ```env
   APP_CORS_ORIGINS=http://localhost:8000
   ```
2. Restart Docker: `docker compose restart api`
3. Test all features again

**Expected Results:**
- ✅ All features work with CORS configured
- ✅ WebSocket connects successfully
- ✅ No CORS errors in browser console

## 🐛 Troubleshooting Tests

### Test 1: Redis Connection

```bash
docker compose exec redis redis-cli ping
# Should return: PONG
```

### Test 2: Database Connection

```bash
docker compose exec postgres psql -U postgres -d pixel_canvas -c "SELECT COUNT(*) FROM pixel;"
# Should return a count of pixels
```

### Test 3: API Endpoints

```bash
# Get all pixels
curl http://localhost:3002/api/pixels

# Get leaderboard
curl http://localhost:3002/api/pixels/leaderboard

# Health check
curl http://localhost:3002/health
```

### Test 4: Docker Health Status

```bash
docker compose ps
# All services should show "healthy" status
```

### Test 5: View Logs

```bash
# API logs
docker compose logs -f api

# All logs
docker compose logs -f

# Look for:
# - "WebSocket connected" messages
# - "New client connected" messages
# - No error messages
```

## 📊 Performance Tests

### Test 1: Rapid Pixel Placement

1. Enter edit mode
2. Rapidly click to place 50+ pixels
3. Click Apply

**Expected Results:**
- ✅ All pixels recorded
- ✅ Gold borders visible on all pending pixels
- ✅ Apply completes in < 5 seconds
- ✅ No errors in console

### Test 2: Concurrent Users

1. Open 10 browser tabs
2. Have each place pixels simultaneously
3. Verify all changes appear in all tabs

**Expected Results:**
- ✅ No race conditions
- ✅ All pixels appear correctly
- ✅ User count updates properly

## ✅ Production Readiness Checklist

Before deploying to production, verify:

- [ ] Health check endpoint works
- [ ] WebSocket connections work with CORS
- [ ] All Docker services have health checks
- [ ] Database has proper credentials
- [ ] `DATABASE_SYNCHRONIZE=false` in production
- [ ] CORS origins set to production domain
- [ ] SSL/TLS configured (if applicable)
- [ ] Firewall rules configured
- [ ] Backup strategy in place
- [ ] Monitoring configured

## 🎯 Success Criteria

All tests should pass with:
- ✅ No errors in browser console
- ✅ No errors in Docker logs
- ✅ All features working as expected
- ✅ Real-time updates working
- ✅ Edit mode with preview working
- ✅ Apply/Discard working correctly
- ✅ WebSocket connection stable

## 📝 Test Report Template

```markdown
## Test Report

**Date**: [Date]
**Tester**: [Name]
**Version**: 1.0.0
**Environment**: [Local/Production]

### Results
- [ ] Initial Setup: PASS/FAIL
- [ ] Health Check: PASS/FAIL
- [ ] Frontend Access: PASS/FAIL
- [ ] WebSocket Connection: PASS/FAIL
- [ ] Edit Mode Toggle: PASS/FAIL
- [ ] Pixel Placement: PASS/FAIL
- [ ] Apply Changes: PASS/FAIL
- [ ] Discard Changes: PASS/FAIL
- [ ] Exit with Unsaved: PASS/FAIL
- [ ] Eraser Tool: PASS/FAIL
- [ ] Color Picker: PASS/FAIL
- [ ] Multi-User Sync: PASS/FAIL
- [ ] Leaderboard: PASS/FAIL
- [ ] Mobile Responsive: PASS/FAIL
- [ ] Production Config: PASS/FAIL

### Issues Found
[List any issues]

### Notes
[Any additional observations]
```

---

**Happy Testing!** 🧪✨

If you encounter any issues, check:
1. Docker logs: `docker compose logs -f`
2. Browser console for JavaScript errors
3. Network tab for failed requests
4. [DEPLOYMENT.md](./DEPLOYMENT.md) troubleshooting section

