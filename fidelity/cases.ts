import type { ConfigCase, RequestCase } from './types'

export const requestCases: RequestCase[] = [
  {
    id: 'server-and-location-order',
    config: `events {}
http {
  server {
    listen 80 default_server;
    server_name default.test;
    return 200 "default";
  }
  server {
    listen 80;
    server_name app.test;
    location / { return 200 "prefix"; add_header X-Location prefix; }
    location = / { return 200 "exact"; add_header X-Location exact; }
    location ~ \\.php$ { return 200 "regex-first"; add_header X-Location regex-first; }
    location ~ \\.php { return 200 "regex-second"; add_header X-Location regex-second; }
    location ^~ /static/ { return 200 "static"; add_header X-Location static; }
  }
}`,
    files: {},
    requests: [
      { path: '/', host: 'app.test' },
      { path: '/post.php', host: 'app.test' },
      { path: '/static/app.php', host: 'app.test' },
      { path: '/', host: 'unknown.test' }
    ]
  },
  {
    id: 'static-root-alias-index-try-files',
    config: `events {}
http {
  server {
    listen 80;
    server_name files.test;
    root /data/site;
    index home.html;
    location /assets/ { alias /data/public/; add_header X-Location alias; }
    location /app/ { try_files $uri $uri/ /index.html; add_header X-Location spa; }
  }
}`,
    files: {
      '/data/site/home.html': 'home',
      '/data/public/logo.txt': 'logo',
      '/data/site/index.html': 'spa'
    },
    requests: [
      { path: '/', host: 'files.test' },
      { path: '/assets/logo.txt', host: 'files.test' },
      { path: '/app/missing', host: 'files.test' },
      { path: '/missing', host: 'files.test' }
    ]
  }
]

export const configCases: ConfigCase[] = [
  { id: 'valid', config: 'events {}\nhttp { server { listen 80; } }' },
  { id: 'missing-semicolon', config: 'events {}\nhttp {\n server {\n  listen 80\n  root /data;\n }\n}' },
  { id: 'unknown-directive', config: 'events {}\nhttp {\n server {\n  lisen 80;\n }\n}' },
  { id: 'unexpected-brace', config: 'events {}\nhttp { server { listen 80; } }\n}' },
  { id: 'missing-brace', config: 'events {}\nhttp {\n server {\n  listen 80;\n }\n' },
  { id: 'wrong-context', config: 'events {}\nhttp {\n listen 80;\n}' },
  { id: 'listen-no-args', config: 'events {}\nhttp {\n server {\n  listen;\n }\n}' },
  { id: 'duplicate-location', config: 'events {}\nhttp {\n server {\n  location / {}\n  location / {}\n }\n}' },
  { id: 'missing-events', config: 'http {}' }
]
