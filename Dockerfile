FROM node:23.9.0-alpine AS deps

WORKDIR /usr/src/app

COPY package*.json ./

RUN npm ci --omit=dev=false

FROM node:23.9.0-alpine AS builder
WORKDIR /usr/src/app
COPY --from=deps /usr/src/app/node_modules ./node_modules
COPY . .
RUN npm run build

FROM node:23.9.0-alpine AS runner
WORKDIR /usr/src/app
ENV NODE_ENV=production
COPY --from=builder /usr/src/app/dist ./dist
COPY --from=builder /usr/src/app/frontend ./frontend
COPY package*.json ./
RUN npm ci --only=production && npm cache clean --force

EXPOSE 3002
EXPOSE 8000

CMD ["npm", "run", "start:prod:full"]