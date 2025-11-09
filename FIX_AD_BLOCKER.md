# Fix: ERR_BLOCKED_BY_CLIENT Error

## Problem
Your browser extension (ad blocker, privacy tool) is blocking requests to `localhost:3001`.

## Quick Fixes

### Option 1: Disable Ad Blocker for Localhost (Recommended)
1. Click on your ad blocker icon (uBlock Origin, AdBlock, etc.)
2. Click "Disable on this site" or "Whitelist this site"
3. The site should be `localhost` or `127.0.0.1`
4. Refresh the page

### Option 2: Add Localhost to Whitelist
**uBlock Origin:**
1. Click uBlock icon → Settings (gear icon)
2. Go to "Filter lists" → "Whitelist"
3. Add: `localhost` or `127.0.0.1`
4. Save and refresh

**AdBlock Plus:**
1. Click AdBlock icon → Settings
2. Go to "Advanced" → "Whitelisted domains"
3. Add: `localhost`
4. Save and refresh

**Privacy Badger:**
1. Click Privacy Badger icon
2. Find `localhost` in the list
3. Set it to "Allow" (green)
4. Refresh

### Option 3: Test in Incognito/Private Mode
1. Open a new incognito/private window (Ctrl+Shift+N or Cmd+Shift+N)
2. Extensions are usually disabled in private mode
3. Navigate to your app
4. Test if it works

### Option 4: Temporarily Disable All Extensions
**Chrome/Edge:**
1. Go to `chrome://extensions/` or `edge://extensions/`
2. Toggle off extensions one by one
3. Test after each to find the culprit
4. Re-enable after testing

**Firefox:**
1. Go to `about:addons`
2. Disable extensions temporarily
3. Test

## Verify Server is Running

Before blaming extensions, make sure the server is actually running:

1. Open: http://localhost:3001/api/status
2. Should see JSON with server status
3. If you see "This site can't be reached", the server isn't running

## Start the Server

If server isn't running:
```bash
cd server
node index.js
```

You should see: `Server running on http://localhost:3001`

## Still Not Working?

1. Check browser console for exact error
2. Try a different browser (Chrome, Firefox, Edge)
3. Check Windows Firewall settings
4. Verify port 3001 is not blocked

## Common Extensions That Block Localhost

- uBlock Origin
- AdBlock Plus
- Privacy Badger
- Ghostery
- DuckDuckGo Privacy Essentials
- Brave Browser's built-in blocker

Most of these can be configured to allow localhost.

