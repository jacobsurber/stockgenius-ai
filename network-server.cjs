const http = require('http');
const port = 8080;

const server = http.createServer((req, res) => {
  console.log(`${new Date().toISOString()} - Request: ${req.method} ${req.url}`);
  
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  
  if (req.url === '/' || req.url === '/login') {
    res.writeHead(200);
    res.end('<!DOCTYPE html><html><head><title>StockGenius</title><style>body{font-family:Arial;background:#0f172a;color:white;padding:20px;text-align:center}h1{color:#00d4aa}</style></head><body><h1>🚀 StockGenius Working!</h1><p>Server successfully running on multiple interfaces</p><p>Enhanced AI features active</p></body></html>');
  } else {
    res.writeHead(200);
    res.end('StockGenius Server Working');
  }
});

// Listen on all interfaces
server.listen(port, '0.0.0.0', () => {
  console.log(`
✅ StockGenius Server ACTIVE on ALL interfaces:
📍 http://localhost:${port}
📍 http://127.0.0.1:${port}  
📍 http://10.0.0.27:${port}

Try any of these URLs in your browser!
  `);
});

server.on('error', (err) => {
  console.error('❌ Server Error:', err);
});

console.log('Starting server on all network interfaces...');