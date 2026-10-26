// pm2: `npm run build && pm2 start ecosystem.config.cjs && pm2 save`
module.exports = {
  apps: [
    {
      name: 'buildpm',
      script: './server/index.js',
      env: { NODE_ENV: 'production' },
      autorestart: true,
      max_restarts: 10,
      min_uptime: '10s',
      restart_delay: 4000,
      max_memory_restart: '400M',
      watch: false,
      error_file: './logs/pm2-error.log',
      out_file: './logs/pm2-out.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss',
      merge_logs: true,
    },
  ],
}
