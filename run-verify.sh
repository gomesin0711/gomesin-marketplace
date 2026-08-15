#!/bin/bash
set -e
cd /home/z/my-project

echo "=== Starting standalone server ==="
NODE_OPTIONS="--max-old-space-size=1024" node .next/standalone/server.js > /tmp/next-prod.log 2>&1 &
SERVER_PID=$!
disown
echo "Server PID=$SERVER_PID"
sleep 3

# Check server alive
if ! ps -p $SERVER_PID > /dev/null; then
  echo "SERVER DIED IMMEDIATELY"
  cat /tmp/next-prod.log
  exit 1
fi
echo "Server alive, port 3000 listening"

# Open browser to homepage
echo "=== Opening browser to homepage ==="
agent-browser open http://localhost:3000/ 2>&1 | tail -1
sleep 2
agent-browser wait --load networkidle 2>&1 | tail -1
agent-browser set viewport 1440 900 2>&1 | tail -1

# Take homepage screenshot (shows Titanium badges on cards)
echo "=== Screenshot 1: Homepage ==="
agent-browser screenshot /home/z/my-project/verify-screenshots/01-homepage.png 2>&1 | tail -1

# Click Masuk button via JS
echo "=== Triggering login dialog ==="
agent-browser eval "(()=>{ const btns = Array.from(document.querySelectorAll('button')).filter(b => b.textContent.includes('Masuk') || b.getAttribute('aria-label')?.includes('Masuk')); btns[0]?.click(); return 'clicked: ' + btns.length })()" 2>&1 | tail -1
sleep 2

# Get snapshot to find PWA dismiss button and login form refs
echo "=== Snapshot login dialog ==="
agent-browser snapshot -i -c > /tmp/snap-login.txt 2>&1
head -40 /tmp/snap-login.txt

# Find and click "Mengerti" (PWA install dismiss) button
echo "=== Dismiss PWA install prompt ==="
agent-browser eval "(()=>{ const btns = Array.from(document.querySelectorAll('button')).filter(b => b.textContent.trim() === 'Mengerti'); if(btns.length){btns[0].click(); return 'dismissed: ' + btns.length} return 'no mengerti button'})()" 2>&1 | tail -1
sleep 1

# Fill login form via JS (more reliable than refs)
echo "=== Fill login form ==="
agent-browser eval "(()=>{ 
  const inputs = document.querySelectorAll('input[type=\"email\"], input[type=\"text\"]'); 
  for(const inp of inputs) { if(inp.placeholder?.includes('email') || inp.type==='email') { 
    const nativeSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set; 
    nativeSetter.call(inp, 'mesinKU0711@gmail.com'); 
    inp.dispatchEvent(new Event('input', {bubbles: true})); 
    return 'email set'; 
  }} 
  return 'no email field'; 
})()" 2>&1 | tail -1
agent-browser eval "(()=>{ 
  const inputs = document.querySelectorAll('input[type=\"password\"]'); 
  if(inputs.length){ 
    const nativeSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set; 
    nativeSetter.call(inputs[0], 'admin123'); 
    inputs[0].dispatchEvent(new Event('input', {bubbles: true})); 
    return 'pw set'; 
  } 
  return 'no pw field'; 
})()" 2>&1 | tail -1

# Click Masuk submit button (the button labeled just "Masuk" inside the form, not the header one)
echo "=== Click Masuk submit ==="
agent-browser eval "(()=>{ 
  const all = Array.from(document.querySelectorAll('button')); 
  const masuk = all.filter(b => b.textContent.trim() === 'Masuk'); 
  // The submit button is the LAST one with text 'Masuk' (first is header, last is submit)
  if(masuk.length >= 2){ masuk[masuk.length-1].click(); return 'clicked submit, found ' + masuk.length + ' masuk buttons'; } 
  if(masuk.length === 1){ masuk[0].click(); return 'clicked only masuk'; }
  return 'no masuk button';
})()" 2>&1 | tail -1
sleep 5

# Check post-login state
echo "=== Post-login snapshot ==="
agent-browser snapshot -i -c > /tmp/snap-after-login.txt 2>&1
head -15 /tmp/snap-after-login.txt

# Check console errors so far
echo "=== Console messages after login ==="
agent-browser console 2>&1 > /tmp/console-after-login.txt
tail -10 /tmp/console-after-login.txt
agent-browser errors 2>&1 > /tmp/errors-after-login.txt
tail -10 /tmp/errors-after-login.txt

echo "=== Server alive after login? ==="
ps -p $SERVER_PID > /dev/null && echo "ALIVE" || echo "DEAD"

echo "=== DONE WITH PART 1 ==="
