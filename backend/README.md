# FixNow Backend

Single Express + MongoDB API for Customer, Technician, and Admin clients.

## Quick start

```bash
# Requires local MongoDB
cd backend
cp .env.example .env   # if needed
npm install
npm run dev
```

- Health: `GET http://localhost:4000/health`
- Version: `GET http://localhost:4000/version`
- API base: `http://localhost:4000/api/v1`

Domain routes return `501 NOT_IMPLEMENTED` until business logic is added. See [BACKEND_ARCHITECTURE.md](./BACKEND_ARCHITECTURE.md).

## Scripts

| Script | Description |
|--------|-------------|
| `npm run dev` | Start with `tsx watch` |
| `npm run build` | Compile TypeScript to `dist/` |
| `npm start` | Run compiled `dist/server.js` |
| `npm run typecheck` | `tsc --noEmit` |
