FROM node:18-slim AS builder

WORKDIR /usr/src/app/frontend
COPY frontend/package*.json ./
RUN npm ci
COPY frontend/ ./
RUN npm run build

FROM node:18-slim

WORKDIR /usr/src/app

COPY package*.json ./
RUN npm ci --only=production

COPY . ./
COPY --from=builder /usr/src/app/frontend/dist ./frontend/dist

EXPOSE 8080

USER node

CMD ["npm", "start"]
