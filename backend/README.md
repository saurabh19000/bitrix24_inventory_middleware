# Bitrix24 Inventory Middleware — Backend

Node.js/Express API server with Prisma ORM, Redis caching, and Bitrix24 integration.

## Quick Start

```bash
cp .env.example .env   # configure environment
npm install
npx prisma migrate dev
npm run dev
```

## Scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | Start development server with hot-reload |
| `npm run build` | Compile TypeScript to `dist/` |
| `npm start` | Run production server |
| `npx prisma migrate dev` | Run migrations (dev) |
| `npx prisma migrate deploy` | Apply migrations (prod) |
| `npx prisma studio` | Open Prisma Studio |

## Environment

Copy `.env.example` to `.env` and fill in the required values. Key variables:

- `DATABASE_URL` — PostgreSQL connection string
- `REDIS_URL` — Redis connection string
- `JWT_SECRET` — Secret for signing JWT tokens
- `BITRIX_ENCRYPTION_KEY` — Key for encrypting Bitrix credentials
