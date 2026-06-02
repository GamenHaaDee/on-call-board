# Multi-stage build: bouwt de frontend en draait daarna de backend,
# die de gebouwde frontend (dist/) meeserveert. Eén container voor alles.

# 1) Dependencies + build
FROM node:20-alpine AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

# 2) Runtime
FROM node:20-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production
COPY package*.json ./
# --include=dev want de server draait via tsx (een devDependency).
RUN npm ci --include=dev
COPY --from=build /app/dist ./dist
COPY server ./server
COPY tsconfig*.json ./
EXPOSE 3001
# De server vult bij opstarten zelf de planning aan (idempotent) en draait dan.
CMD ["npm", "run", "server"]
