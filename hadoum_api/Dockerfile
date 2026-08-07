FROM node:22-alpine AS builder
WORKDIR /app
COPY package*.json nest-cli.json tsconfig*.json prisma.config.ts ./
COPY prisma ./prisma
RUN npm ci
RUN npx prisma generate
COPY src ./src
RUN npm run build
RUN ls dist/main.js

FROM node:22-alpine
RUN apk add --no-cache tini curl
WORKDIR /app
ENV NODE_ENV=production
COPY package*.json prisma.config.ts ./
RUN npm ci --omit=dev && npm cache clean --force
COPY --from=builder /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=builder /app/node_modules/@prisma/client ./node_modules/@prisma/client
COPY prisma ./prisma
COPY --from=builder /app/dist ./dist
COPY entrypoint.sh healthcheck.js ./
COPY scripts ./scripts
RUN chmod +x entrypoint.sh scripts/*.sh 2>/dev/null; \
    chown -R node:node /app
USER node
EXPOSE 3001
HEALTHCHECK --interval=15s --timeout=5s --retries=5 --start-period=30s \
  CMD ["node", "healthcheck.js"]
ENTRYPOINT ["/sbin/tini", "--", "./entrypoint.sh"]
