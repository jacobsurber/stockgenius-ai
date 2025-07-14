// Simple test API endpoint
export default function handler(req, res) {
  res.status(200).json({ 
    message: 'StockGenius API is working!',
    timestamp: new Date().toISOString(),
    status: 'success'
  });
}