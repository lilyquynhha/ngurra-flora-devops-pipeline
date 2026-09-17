# Ngurra Flora

> *Ngurra* means "country" or "home" in several Australian Aboriginal languages

Ngurra Flora is a RESTful API for Australian native and indigenous plant species. It provides structured access to taxonomic data sourced from the [Atlas of Living Australia (ALA)](https://ala.org.au), with geographic occurrence records stored and queried using PostGIS spatial extensions.

## Bounded Contexts

The API is organised around five bounded contexts:

- **Plants**: taxonomic records including scientific name, common name, family, genus, conservation status, and imagery
- **Regions**: Australian states and territories, each linked to the plants found within them
- **Occurrences**: individual sighting records with GPS coordinates, enabling spatial queries
- **Tags**: flexible labels applied to plants (e.g. `edible`, `endangered`, `flowering`)
- **Users**: authentication and role-based access control

## Interacting with the API

All endpoints are documented interactively via Swagger UI at `http://localhost:3000/api-docs` when the server is running. The raw OpenAPI spec is available at `http://localhost:3000/api-docs.json`.

Three user roles control access:

| Role | Permissions |
|---|---|
| `VIEWER` (default) | Read-only access to all public endpoints |
| `CONTRIBUTOR` | VIEWER + create and update plants, occurrences, and tags |
| `ADMIN` | Full access including delete operations and region management |

Notable endpoints include spatial queries powered by PostGIS:
- `GET /occurrences/nearby?lat=&lng=&radius=`: find sightings within a radius of a coordinate
- `GET /occurrences/bbox?minLng=&minLat=&maxLng=&maxLat=`: find sightings within a bounding box
- `GET /plants/nearby?lat=&lng=&radius=`: find distinct plant species observed near a coordinate

---

## Running Locally

### Prerequisites

- Node.js 22+
- PostgreSQL 16 with the PostGIS extension installed
- Git

### 1. Clone the repository

```bash
git clone https://github.com/lilyquynhha/ngurra-flora.git
cd ngurra-flora
npm install
```

### 2. Configure environment variables

Create a `.env` file in the project root:

```env
DATABASE_URL="postgresql://postgres:yourpassword@localhost:5432/ngurra_flora"
JWT_SECRET="your_long_random_secret"
JWT_EXPIRES_IN="7d"
NODE_ENV="development"
PORT=3000
```

Generate a secure `JWT_SECRET` with:
```bash
node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"
```

### 3. Enable PostGIS

Run this once against your database before migrating:
```sql
CREATE EXTENSION IF NOT EXISTS postgis;
```

### 4. Run migrations

```bash
npx prisma migrate dev
```

### 5. Seed the database

This fetches plant and occurrence data from the ALA API and populates all tables:
```bash
npx prisma db seed
```

The seed script fetches 50 Australian native plant species with occurrence records, links them to regions, and assigns tags automatically based on conservation status and plant family.

### 6. Start the development server

```bash
npm run dev
```

The server runs at `http://localhost:3000`. Swagger UI is available at `http://localhost:3000/api-docs`.

### Running tests

```bash
npm test
```

---

## Technology Stack

- **Runtime**: Node.js
- **Framework**: Express.js
- **Language**: TypeScript
- **ORM**: Prisma
- **Database**: PostgreSQL 16
- **Spatial extension**: PostGIS
- **Authentication**: JWT via `jsonwebtoken`
- **Password hashing**: bcryptjs
- **Validation**: Zod
- **API documentation**: Swagger UI (`swagger-jsdoc` + `swagger-ui-express`)
- **Testing**: Vitest + Supertest
- **Rate limiting**: express-rate-limit
- **Logging**: Morgan
- **Code formatting**: Prettier
- **Data source**: Atlas of Living Australia (ALA) REST API + Biocache API

---

## Purpose

This project was developed as a university assignment (SIT331 - Backend Developement). It demonstrates the ability to design and implement a high-quality backend service from scratch: defining a domain, identifying bounded contexts, modelling a relational database, building a RESTful API with authentication and authorisation, integrating an external data source, implementing geospatial queries, and producing tests and documentation.