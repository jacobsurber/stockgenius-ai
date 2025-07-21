export default function handler(req, res) {
  res.status(200).json({ 
    message: 'StockGenius API Working',
    timestamp: new Date().toISOString()
  });
}