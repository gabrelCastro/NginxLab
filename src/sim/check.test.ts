import { describe, expect, it } from 'vitest'
import { checkConfig } from './check'

const valid = `events {}
http {
    server {
        listen 80;
        root /usr/share/nginx/html;
    }
}`

describe('nginx -t', () => {
  it('prints the nginx 1.27 success output', () => {
    expect(checkConfig(valid).output).toEqual([
      'nginx: the configuration file /etc/nginx/nginx.conf syntax is ok',
      'nginx: configuration file /etc/nginx/nginx.conf test is successful'
    ])
  })

  it.each([
    {
      name: 'missing semicolon reports the following line',
      config: `events {}\nhttp {\n server {\n  listen 80\n  root /var/www;\n }\n}`,
      error: 'nginx: [emerg] invalid parameter "root" in /etc/nginx/nginx.conf:5'
    },
    {
      name: 'unknown directive',
      config: `events {}\nhttp {\n server {\n  lisen 80;\n }\n}`,
      error: 'nginx: [emerg] unknown directive "lisen" in /etc/nginx/nginx.conf:4'
    },
    {
      name: 'unexpected closing brace',
      config: `${valid}\n}`,
      error: 'nginx: [emerg] unexpected "}" in /etc/nginx/nginx.conf:8'
    },
    {
      name: 'missing closing brace',
      config: `events {}\nhttp {\n server {\n  listen 80;\n }\n`,
      error: 'nginx: [emerg] unexpected end of file, expecting "}" in /etc/nginx/nginx.conf:6'
    },
    {
      name: 'directive in the wrong context',
      config: `events {}\nhttp {\n listen 80;\n}`,
      error: 'nginx: [emerg] "listen" directive is not allowed here in /etc/nginx/nginx.conf:3'
    },
    {
      name: 'listen without arguments',
      config: `events {}\nhttp {\n server {\n  listen;\n }\n}`,
      error: 'nginx: [emerg] invalid number of arguments in "listen" directive in /etc/nginx/nginx.conf:4'
    },
    {
      name: 'duplicate location',
      config: `events {}\nhttp {\n server {\n  location / {}\n  location / {}\n }\n}`,
      error: 'nginx: [emerg] duplicate location "/" in /etc/nginx/nginx.conf:5'
    }
  ])('$name', ({ config, error }) => {
    const result = checkConfig(config)
    expect(result.ok).toBe(false)
    expect(result.output[0]).toBe(error)
    expect(result.output.at(-1)).toBe('nginx: configuration file /etc/nginx/nginx.conf test failed')
  })

  it('reports a missing events block after syntax succeeds', () => {
    expect(checkConfig('http {}').output).toEqual([
      'nginx: the configuration file /etc/nginx/nginx.conf syntax is ok',
      'nginx: [emerg] no "events" section in configuration',
      'nginx: configuration file /etc/nginx/nginx.conf test failed'
    ])
  })

  it('refuses a real directive outside the simulated subset honestly', () => {
    const result = checkConfig('events {}\nhttp { sendfile on; }')
    expect(result.output[0]).toContain('é válida no nginx, mas ainda não é simulada')
  })
})
