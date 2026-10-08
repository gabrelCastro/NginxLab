# Contexto de build: raiz do repositório (docker build -f deploy/web/Dockerfile .)
FROM node:22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY index.html tsconfig.json tsconfig.app.json tsconfig.node.json vite.config.ts playwright.config.ts ./
COPY src ./src
COPY fidelity ./fidelity
RUN npm run build

FROM nginx:1.27-alpine
COPY deploy/web/default.conf /etc/nginx/conf.d/default.conf
COPY deploy/web/security-headers.conf /etc/nginx/snippets/security-headers.conf
COPY --from=build /app/dist /usr/share/nginx/html
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=3s CMD wget -qO- http://127.0.0.1:8080/ >/dev/null || exit 1
