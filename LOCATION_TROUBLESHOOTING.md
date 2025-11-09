# Location Not Working - Troubleshooting Guide

## Quick Checks

### 1. Check Browser Console
Open DevTools (F12) → Console tab and look for:
- `Location permission status: granted` (good!)
- `Location permission status: denied` (need to enable)
- `Location obtained: { latitude: ..., longitude: ... }` (working!)

### 2. Test Location in Console
Paste this in the browser console to test:
```javascript
navigator.geolocation.getCurrentPosition(
  (pos) => console.log('✅ Location works!', pos.coords),
  (err) => console.error('❌ Location error:', err.code, err.message)
);
```

### 3. Check Permission Status
Paste this in console:
```javascript
navigator.permissions.query({name: 'geolocation'}).then(result => {
  console.log('Permission status:', result.state);
  // Should be: 'granted', 'prompt', or 'denied'
});
```

## Common Issues & Solutions

### Issue 1: Permission is "Ask" instead of "Allow"
**Problem:** Browser is set to "Ask" which might not trigger the prompt.

**Solution:**
1. Click the location icon in address bar
2. Select **"Always allow"** (not just "Allow")
3. Refresh the page (F5)

### Issue 2: Need to Refresh After Enabling
**Problem:** Browser caches permission state.

**Solution:**
1. Enable location permission
2. **Hard refresh:** Ctrl+Shift+R (Windows) or Cmd+Shift+R (Mac)
3. Or close and reopen the browser tab

### Issue 3: HTTPS Required
**Problem:** Some browsers require HTTPS for geolocation (except localhost).

**Solution:**
- Make sure you're using `http://localhost:5173` (localhost is allowed)
- If using a different URL, it must be HTTPS

### Issue 4: Browser Settings Block Location
**Problem:** System-level or browser-level location blocking.

**Solution:**
- **Chrome:** Settings → Privacy → Site settings → Location → Make sure not blocked
- **Firefox:** about:preferences#privacy → Permissions → Location → Settings
- **Windows:** Settings → Privacy → Location → Make sure location is enabled

### Issue 5: VPN or Proxy Blocking
**Problem:** VPN or proxy might interfere with geolocation.

**Solution:**
- Try disabling VPN temporarily
- Check if proxy settings are blocking location

## Step-by-Step Fix

1. **Open browser console** (F12)
2. **Check permission status** (paste the code above)
3. **If denied:**
   - Click location icon in address bar
   - Select "Always allow"
   - Hard refresh (Ctrl+Shift+R)
4. **If still not working:**
   - Check browser settings
   - Try incognito/private mode
   - Try different browser
   - Check Windows location settings

## What to Look For

### In Console (Good Signs):
```
Location permission status: granted
Location obtained: { latitude: 44.4268, longitude: 26.1025 }
```

### In Console (Problems):
```
Location permission status: denied  ← Need to enable
Geolocation error: PERMISSION_DENIED  ← Permission blocked
Geolocation error: TIMEOUT  ← Taking too long, try again
```

## Manual Test

1. Open: https://www.google.com/maps
2. Click "Use your location"
3. If Google Maps can get your location, the browser works fine
4. If Google Maps also fails, it's a browser/system issue

## Still Not Working?

1. **Check console logs** - Look for the detailed error messages I added
2. **Try different browser** - Test in Chrome, Firefox, Edge
3. **Check Windows location settings** - Settings → Privacy → Location
4. **Restart browser** - Sometimes helps clear cached permissions

