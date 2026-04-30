# MyCloud — Self-Hosted Cloud Platform

A full-stack cloud management platform inspired by AWS, running entirely via Docker Compose.

## Features

| Service | Description |
|---------|-------------|
| **Compute** | Spin up/stop Docker containers with resource limits (like EC2) |
| **Object Storage** | Create buckets, upload/download files, public/private access (like S3) |
| **Databases** | Provision PostgreSQL or SQLite instances (like RDS) |
| **Networking** | Isolated namespaces + Docker bridge networks + firewall rules (like VPC) |
| **Dashboard** | Real-time metrics, billing simulation, activity log |

## Prerequisites

- [Docker Desktop](https://www.docker.com/products/docker-desktop/) (with Docker Engine running)
- [Docker Compose](https://docs.docker.com/compose/) (included with Docker Desktop)

## Quick Start

```bash
# Clone / enter the project
cd mycloud

# Start everything
docker-compose up --build

# Open the dashboard
open http://localhost:5173
```

Login with the pre-seeded admin account:
- **Email:** `admin@mycloud.local`
- **Password:** `admin123`

## Architecture

```
┌──────────────┐     ┌──────────────────────┐     ┌─────────────┐
│  Frontend    │────▶│  Backend (Express)    │────▶│  PostgreSQL │
│  React/Vite  │     │  Port 3000            │     │  (metadata) │
│  Port 5173   │     │  + Socket.io          │     └─────────────┘
└──────────────┘     │  + dockerode          │
      (Nginx)        └──────────┬───────────┘
                                │ /var/run/docker.sock
                                ▼
                         Docker Engine (host)
                    (manages compute/db containers)
```

## Services & Ports

| Service | Port | Description |
|---------|------|-------------|
| Frontend | 5173 | React dashboard (Nginx in prod) |
| Backend API | 3000 | REST API + WebSockets |
| PostgreSQL | — | Internal only (no host port) |

## API Reference

### Auth
```
POST /api/auth/register    { email, password }
POST /api/auth/login       { email, password }
GET  /api/auth/me          (JWT required)
PUT  /api/auth/password    { currentPassword, newPassword }
```

### Compute
```
GET    /api/compute/instances
POST   /api/compute/instances        { name, image, instanceType }
GET    /api/compute/instance-types
POST   /api/compute/instances/:id/start
POST   /api/compute/instances/:id/stop
DELETE /api/compute/instances/:id
GET    /api/compute/instances/:id/metrics
```

### Storage
```
GET    /api/storage/buckets
POST   /api/storage/buckets          { name, access: "public"|"private" }
PATCH  /api/storage/buckets/:bucket  { access }
DELETE /api/storage/buckets/:bucket

PUT    /storage/:bucket/:key         (multipart file upload)
GET    /storage/:bucket/:key         (download; public buckets need no auth)
DELETE /storage/:bucket/:key
```

### Databases
```
GET    /api/databases
POST   /api/databases          { name, engine: "postgres"|"sqlite", version }
GET    /api/databases/:id
POST   /api/databases/:id/start
POST   /api/databases/:id/stop
DELETE /api/databases/:id
```

### Networking
```
GET    /api/networking/namespaces
POST   /api/networking/namespaces              { name }
GET    /api/networking/namespaces/:id
DELETE /api/networking/namespaces/:id

GET    /api/networking/namespaces/:id/rules
POST   /api/networking/namespaces/:id/rules    { direction, port, protocol, action }
DELETE /api/networking/namespaces/:id/rules/:ruleId
```

### Dashboard
```
GET /api/dashboard/summary
GET /api/dashboard/billing
GET /api/dashboard/activity
```

## Instance Types

| Type | vCPU | RAM | Cost |
|------|------|-----|------|
| small | 0.25 | 256 MB | $0.0058/hr |
| medium | 0.50 | 512 MB | $0.0116/hr |
| large | 1.00 | 1024 MB | $0.0232/hr |

## Running Tests

Tests require a running PostgreSQL instance (use docker-compose or a local PostgreSQL):

```bash
cd backend

# Copy and configure environment
cp .env.example .env
# Edit DATABASE_URL to point to your PostgreSQL

npm install
npm test
```

Docker operations are mocked in tests — no real Docker daemon needed.

## Local Development (without Docker Compose)

```bash
# Start PostgreSQL separately
docker run -d --name mycloud-pg \
  -e POSTGRES_DB=mycloud \
  -e POSTGRES_USER=mycloud \
  -e POSTGRES_PASSWORD=mycloud_secret \
  -p 5432:5432 \
  postgres:16-alpine

# Backend
cd backend
cp .env.example .env    # set DATABASE_URL=postgres://mycloud:mycloud_secret@localhost:5432/mycloud
npm install
npm run seed
npm run dev             # starts on :3000 with nodemon

# Frontend (separate terminal)
cd frontend
npm install
npm run dev             # starts on :5173 with Vite proxy
```

## Data Persistence

| Data | Location |
|------|----------|
| Platform metadata | `postgres_data` Docker volume |
| Uploaded files | `storage_data` Docker volume |
| Provisioned DB containers | Host Docker Engine |

## Environment Variables

See [backend/.env.example](backend/.env.example) for all configurable variables.

| Variable | Default | Description |
|----------|---------|-------------|
| `DATABASE_URL` | postgres://... | PostgreSQL connection string |
| `JWT_SECRET` | — | **Change in production!** |
| `STORAGE_PATH` | `/app/storage` | File storage root |
| `PORT` | `3000` | Backend HTTP port |
| `CORS_ORIGIN` | `http://localhost:5173` | Allowed CORS origin |

## Security Notes

- Change `JWT_SECRET` before any real deployment
- The Docker socket mount gives the backend full Docker control — restrict access appropriately
- Provisioned PostgreSQL containers bind to host ports starting at 15432; firewall these in production
