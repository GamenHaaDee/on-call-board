# Multi-stage build: bouwt de frontend en draait daarna de backend,
# die de gebouwde frontend (dist/) meeserveert. Eén container voor alles —
# met DB_DRIVER=sqlite is er geen aparte databaseserver nodig.

# 1) Dependencies + build
FROM node:24-alpine AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

# 2) Runtime (node:sqlite zit ingebouwd in Node 22.5+)
FROM node:24-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production
COPY package*.json ./
# --include=dev want de server draait via tsx (een devDependency).
RUN npm ci --include=dev
COPY --from=build /app/dist ./dist
COPY server ./server
COPY tsconfig*.json ./
# Database + instellingen staan in /app/data; mount dat als volume, anders
# verdwijnen ze bij een herbouw.
RUN mkdir -p /app/data && chown node:node /app/data
VOLUME ["/app/data"]
USER node
EXPOSE 3001
# De server maakt de tabel aan (sqlite), vult de planning aan en draait dan.
CMD ["npm", "run", "server"]
