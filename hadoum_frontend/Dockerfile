FROM node:22-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM nginx:1.27-alpine
COPY --from=builder /app/dist /usr/share/nginx/html
COPY templates/default.conf.template /etc/nginx/templates/default.conf.template

# Only substitute our own NGINX_* variables in the template; nginx's
# built-in runtime variables ($host, $remote_addr, ...) are left as-is.
ENV NGINX_ENVSUBST_FILTER=^NGINX_
ENV NGINX_SERVER_NAME=hadoum.com
ENV NGINX_CERT_DOMAIN=hadoum.com

EXPOSE 80 443
HEALTHCHECK --interval=15s --timeout=5s --retries=5 --start-period=10s \
  CMD wget -qO- http://127.0.0.1/healthz || exit 1
