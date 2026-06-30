FROM node:22-slim AS build
WORKDIR /app

# Copy entire server and client directories so build can access source files
COPY server/ ./server/
COPY client/ ./client/

RUN apt-get update && apt-get install -y python3 make g++ && rm -rf /var/lib/apt/lists/* || true

# Install server deps
WORKDIR /app/server
RUN npm install --production

# Install and build client
WORKDIR /app/client
RUN npm install
RUN npm run build

FROM node:22-slim
WORKDIR /app

# Copy server
COPY --from=build /app/server /app/server
# Copy built client into server/public
COPY --from=build /app/client/dist /app/server/public

WORKDIR /app/server
ENV NODE_ENV=production
EXPOSE 3000

RUN mkdir -p /app/data /app/prints

CMD ["node", "index.js"]
