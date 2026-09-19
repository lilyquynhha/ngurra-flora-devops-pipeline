# --- Build stage
FROM node:22-slim AS builder

WORKDIR /app

# install dependencies
COPY package*.json ./
RUN npm ci

# copy over all source files
COPY . .

# dummy database url so prisma generate can run. the real database url is supplied later by the container
ENV DATABASE_URL="postgresql://placeholder:placeholder@localhost:5432/placeholder"

# generate prisma client
RUN npx prisma generate --schema=src/prisma/schema.prisma

# build the app
RUN npm run build

# --- Production stage
FROM node:22-slim AS production

WORKDIR /app

# install any Debian security patches released since this base image was built
RUN apt-get update && apt-get upgrade -y && rm -rf /var/lib/apt/lists/*

# install dependencies & remove npm cli once done as it's not needed
COPY package*.json ./
RUN npm ci --omit=dev && \
    rm -rf /usr/local/lib/node_modules/npm /usr/local/bin/npm /usr/local/bin/npx

# copy over compiled output, Prisma client, and static resources in /public from the builder stage
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/node_modules/@prisma ./node_modules/@prisma
COPY --from=builder /app/src/prisma ./src/prisma
COPY --from=builder /app/src/public ./src/public

EXPOSE 3000

CMD ["node", "dist/server.js"]