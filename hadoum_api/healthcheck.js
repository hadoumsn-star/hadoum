// Used by the Docker HEALTHCHECK instruction and by docker-compose
// healthchecks. Kept dependency-free (plain http) so it works in the
// minimal runtime image without needing curl/wget.
const http = require('http');

const port = process.env.PORT || 3001;

const req = http.get({ host: '127.0.0.1', port, path: '/api/health', timeout: 3000 }, (res) => {
  if (res.statusCode && res.statusCode < 400) {
    process.exit(0);
  }
  process.exit(1);
});

req.on('error', () => process.exit(1));
req.on('timeout', () => {
  req.destroy();
  process.exit(1);
});
