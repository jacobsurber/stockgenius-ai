export default function handler(req, res) {
  res.status(200).json({ message: 'Test deployment working' });
}
EOF < /dev/null