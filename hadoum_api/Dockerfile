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
WORKDIR /app
COPY package*.json prisma.config.ts ./
RUN npm ci --omit=dev
COPY --from=builder /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=builder /app/node_modules/@prisma/client ./node_modules/@prisma/client
COPY prisma ./prisma
COPY --from=builder /app/dist ./dist
COPY entrypoint.sh ./
RUN chmod +x entrypoint.sh
EXPOSE 3001
ENTRYPOINT ["./entrypoint.sh"]
