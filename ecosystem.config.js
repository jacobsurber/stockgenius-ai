// PM2 Configuration for StockGenius
// Production-ready process management

module.exports = {
  apps: [{
    name: 'stockgenius',
    script: './dist/web/index.js',
    instances: 1,
    exec_mode: 'cluster',
    max_memory_restart: '1G',
    
    // Environment variables
    env: {
      NODE_ENV: 'development',
      WEB_PORT: 8080,
    },
    env_production: {
      NODE_ENV: 'production',
      WEB_PORT: 8080,
    },
    
    // Logging
    error_file: './logs/pm2-error.log',
    out_file: './logs/pm2-out.log',
    log_file: './logs/pm2-combined.log',
    time: true,
    
    // Watch & Restart
    watch: false,
    ignore_watch: ['node_modules', 'logs', 'data', '.git'],
    
    // Restart policy
    min_uptime: '10s',
    max_restarts: 10,
    restart_delay: 4000,
    
    // Graceful shutdown
    kill_timeout: 5000,
    listen_timeout: 3000,
    
    // Health monitoring
    autorestart: true,
    
    // Pre-setup commands
    pre_setup: 'npm install',
    
    // Post-deploy actions
    post_deploy: 'npm run build'
  }]
};