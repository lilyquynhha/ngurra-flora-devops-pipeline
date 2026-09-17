# ---- Build stage ----
FROM node:22-slim AS builder

WORKDIR /app

# install dependencies
COPY package*.json ./
RUN npm ci

COPY . .

# dummy database url so prisma generate can run. the real database url is supplied later by the container
ENV DATABASE_URL="postgresql://placeholder:placeholder@localhost:5432/placeholder"

# generate prisma client
RUN npx prisma generate --schema=src/prisma/schema.prisma

RUN npm run build

# ---- Production stage ----
FROM node:22-slim AS production

WORKDIR /app

# install dependencies
COPY package*.json ./
RUN npm ci --omit=dev

# Copy compiled output and generated Prisma client from the builder stage
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/node_modules/@prisma ./node_modules/@prisma
COPY --from=builder /app/src/prisma ./src/prisma

EXPOSE 3000

CMD ["node", "dist/server.js"]