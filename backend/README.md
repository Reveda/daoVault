# DAOvault Backend

Node.js + Express + TypeScript + Prisma + PostgreSQL backend foundation for DAOvault AI.

## Setup

```powershell
Copy-Item .env.example .env
npm install
npx prisma generate
npx prisma migrate dev --name init
npm run dev
```

Health check:

```text
GET http://localhost:5000/api/v1/health
```

## Architecture

- `src/config`: environment and Prisma client
- `src/middlewares`: common Express middleware
- `src/modules`: feature modules and their routes
- `prisma/schema.prisma`: PostgreSQL data model and migrations

The first commit intentionally exposes read-only health, user and dashboard endpoints. Wallet signature authentication, on-chain payment verification, commission calculation and withdrawals should be added as separate modules after the database is running. No private keys or payout logic belong in this initial scaffold.
