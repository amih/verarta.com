const fs = require('fs');
const path = require('path');

// Load .env file
function loadEnv() {
  const envPath = path.join(__dirname, '.env');
  const env = {};

  if (fs.existsSync(envPath)) {
    const envContent = fs.readFileSync(envPath, 'utf8');
    envContent.split('\n').forEach(line => {
      const trimmed = line.trim();
      if (trimmed && !trimmed.startsWith('#')) {
        const [key, ...valueParts] = trimmed.split('=');
        if (key && valueParts.length > 0) {
          env[key.trim()] = valueParts.join('=').trim();
        }
      }
    });
  }

  return env;
}

module.exports = {
  apps: [{
    name: 'verarta-backend',
    script: './dist/server/entry.mjs',
    cwd: __dirname,
    instances: 1,
    exec_mode: 'fork',
    env: loadEnv(),
    watch: false,
    max_memory_restart: '500M',
    error_file: '~/.pm2/logs/verarta-backend-error.log',
    out_file: '~/.pm2/logs/verarta-backend-out.log',
    log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
  }]
};
