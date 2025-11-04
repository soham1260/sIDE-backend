# sIDE-backend

A backend service for sIDE — a collaborative, real-time code editor / IDE.  
This repository provides the server-side API, real-time collaboration (WebSocket) endpoints, and integrations for persistence, authentication, and tooling used by the sIDE frontend.

## Table of contents
- [Key features](#key-features)
- [Tech stack](#tech-stack)
- [Getting started](#getting-started)
  - [Prerequisites](#prerequisites)
  - [Clone](#clone)
  - [Environment variables](#environment-variables)
  - [Local development](#local-development)
  - [Docker](#docker)
- [Contact](#contact)

## Key features
- REST API for user, project, file, and session management.
- Real-time collaborative editing via WebSocket / Socket.IO.
- Authentication & authorization (JWT / session-based).
- Persistence with relational or NoSQL datastore (MongoDB).
- File execution / sandboxing interface.
- Dockerized for easy deployment.

## Tech stack
- Runtime: Node.js
- Framework: ExpressJS
- Language: JavaScript
- Database: MongoDB

## Getting started

### Prerequisites
- Git >= 2.20
- Node.js >= 16
- Docker
- A database (MongoDB)

### Clone
```bash
git clone https://github.com/soham1260/sIDE-backend.git
cd sIDE-backend
```

### Environment variables
Create a `.env` file at the project root from `.env.example` (if present). Example variables commonly used:

```
# Server
PORT=4000

# Database (example for Postgres)
DB=mongodb+srv://<username>:<password>@cluster.mongodb.net/<dbname>

# Auth
JWT=replace_with_a_strong_secret

# Docker
VM_IP=ip
VM_PORT=port
```

Make sure to replace placeholders with secure values in production.

### Local development
Adjust commands to match the scripts in package.json.

Install dependencies:
```bash
npm install
```

Run the server:
```bash
node index.js
```

### Docker
- Ensure Docker is installed and running.
- The backend automatically connects to Docker via the default socket (`/var/run/docker.sock`) if no ip or port provided.
- Pre-pull the required language images:
  ```bash
  docker pull gcc
  docker pull openjdk
  docker pull node
  docker pull python
  ```

## Contact
Maintainer: 1260soham@gmail.com
---