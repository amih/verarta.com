// Combined PM2 ecosystem for running both indexer and API in a single container.
// This is needed so the API can reach the indexer's control port (7002) on localhost.
module.exports = {
  apps: [
    {
      script: './build/indexer/launcher.js',
      name: 'verarta-test-indexer',
      namespace: 'verarta-test',
      interpreter: 'node',
      interpreter_args: ['--max-old-space-size=4096'],
      autorestart: false,
      kill_timeout: 3600,
      watch: false,
      time: true,
      env: {
        CONFIG_JSON: 'config/chains/verarta-test.config.json',
        TRACE_LOGS: 'false',
      },
    },
    {
      script: './build/api/server.js',
      name: 'verarta-test-api',
      namespace: 'verarta-test',
      node_args: ['--max-old-space-size=1024'],
      exec_mode: 'cluster',
      merge_logs: true,
      instances: 1,
      autorestart: true,
      exp_backoff_restart_delay: 100,
      watch: false,
      time: true,
      env: {
        CONFIG_JSON: 'config/chains/verarta-test.config.json',
      },
    }
  ]
};
