# ReachInbox Full-Stack Email Scheduler

A full-stack email scheduling application built with Node.js, Express, TypeScript, BullMQ, Redis, PostgreSQL (Prisma), Elasticsearch, Nodemailer (Ethereal SMTP), and React (Vite & Tailwind CSS).

The project focuses on delayed email scheduling, distributed rate limiting, persistent job processing, email search, and multi-sender support.

## Deployment Status

The application has a deployed frontend, but some features may not function correctly in the live demo due to backend deployment or environment configuration issues. Features implemented in the codebase should be distinguished from features verified in the deployed environment.

For the most complete evaluation, follow the local setup instructions below. External integrations, such as Google OAuth and Slack notifications, may require valid credentials and additional configuration.

## Architecture Overview

The application uses the following components:

- **Frontend:** React, Vite, and Tailwind CSS
- **Backend:** Node.js, Express, and TypeScript
- **Job scheduling:** BullMQ delayed jobs
- **Queue storage:** Redis
- **Database:** PostgreSQL with Prisma
- **Email delivery:** Nodemailer with Ethereal SMTP for testing
- **Search:** Elasticsearch, with PostgreSQL as the primary data store
- **Rate limiting:** Redis Lua scripts for atomic quota checks
- **Notifications:** Slack integration for rate-limit events
- **Authentication:** Google OAuth token verification

## Key Technical Features

### 1. BullMQ Delayed Job Scheduling

Emails are scheduled using BullMQ delayed jobs rather than cron jobs or periodic database polling as the primary dispatch mechanism.

The intended scheduling delay is calculated as:

`delay = max(0, scheduledAt - now) + index × minDelayMs`

This supports scheduled execution and spacing between email sends.

### 2. Redis-Based Rate Limiting

Redis Lua scripts are used to coordinate rate-limit checks across concurrent workers.

The implementation is designed to:

- Track sending activity per sender using Redis sorted sets.
- Remove expired entries from the hourly window.
- Enforce configured hourly limits and minimum spacing between sends.
- Reschedule jobs when a sender reaches the configured limit.
- Record rate-limit events in PostgreSQL.
- Trigger deduplicated Slack notifications when configured.
- Roll back rate-limit reservations when a send fails, where supported by the delivery implementation.

### 3. Persistent Scheduling and Restart Recovery

Scheduled jobs are stored in Redis through BullMQ, while email records are maintained in PostgreSQL.

The recovery implementation includes `SchedulerService.recoverUnscheduledJobs()`, intended to identify eligible scheduled or interrupted records and restore missing queue jobs after a restart.

Restart recovery should be verified by restarting the worker and checking that eligible jobs are processed without duplication.

### 4. Elasticsearch Search

Elasticsearch supports full-text search across indexed email records.

PostgreSQL remains the primary data store. The project also includes a database-backed search fallback when Elasticsearch is unavailable.

`ElasticsearchService.bulkSyncFromDatabase()` is intended to support rebuilding the search index from database records.

### 5. Slack Rate-Limit Notifications

The Slack integration is designed to notify a configured channel when a sender reaches an hourly sending limit.

Redis-based deduplication keys are used to reduce repeated notifications for the same sender and time window. Working Slack notifications require valid integration credentials and configuration.

### 6. Email and Sender Management

The React dashboard and compose-email interface support email campaign management. The project includes recipient parsing, scheduling options, sender configuration, and scheduled/sent email views.

Feature availability in the deployed application depends on the backend and its environment configuration.

## Quickstart and Setup Guide

### 1. Prerequisites

- Node.js v20.x or higher
- npm v10.x or higher
- Docker and Docker Compose

### 2. Start Infrastructure Containers

Start PostgreSQL, Redis, and Elasticsearch:

```bash
docker compose up -d
```

Check container status:

```bash
docker compose ps
```

Confirm that the required services are running and healthy before continuing.

### 3. Set Up the Backend and Database

Push the Prisma schema to PostgreSQL:

```bash
npm run --workspace=backend prisma:db-push
```

Alternatively, if supported by the installed Prisma setup:

```bash
npx --prefix backend prisma db push
```

Generate the Prisma Client:

```bash
npm run --workspace=backend prisma:generate
```

Set up an Ethereal SMTP test account:

```bash
npm run ethereal:setup
```

Configure the required environment variables using the project's environment example files. Never commit passwords, API keys, or other secrets to GitHub.

### 4. Run the Application

Start the development stack:

```bash
npm run dev
```

If separate processes are required, use separate terminals.

**Terminal 1 — Backend API**

```bash
npm run dev:api
```

**Terminal 2 — BullMQ Worker**

```bash
npm run dev:worker
```

**Terminal 3 — Frontend**

```bash
npm run dev:frontend
```

### 5. Application Endpoints

| Service | URL | Purpose |
|---|---|---|
| Frontend dashboard | http://localhost:5173 | React dashboard |
| Backend API | http://localhost:5000 | Express API and health endpoints |
| BullMQ Board | http://localhost:5000/admin/queues | Queue and job monitoring |
| Elasticsearch | http://localhost:9200 | Search service |

These are the expected local endpoints based on the project configuration. Actual availability depends on successful startup and environment configuration.

## Testing and Verification

Run the project's test suite:

```bash
npm test
```

The repository includes tests intended to cover:

- **End-to-end scheduling:** Campaign scheduling, delayed jobs, email delivery, and search.
- **Rate limiting:** Redis Lua-based quota enforcement and usage calculations.
- **Recipient parsing:** Whitespace trimming, duplicate removal, and invalid email filtering.
- **API integration:** Health checks, sender endpoints, recipient parsing, dashboard statistics, and queue access.

Test files describe intended coverage; their presence alone does not establish that every test passes. Confirm the actual test output before reporting the test count or claiming complete test success.

## Video Demo Checklist

Demonstrate only features you can verify successfully. Use a local demonstration for features affected by the live deployment, if they work locally.

### 1. Dashboard and Setup

- Open the dashboard.
- Show the available dashboard sections.
- Demonstrate sender configuration if it is working.
- Confirm that the API and worker are running.

### 2. Recipient Parsing and Scheduling

- Open **Compose Email**.
- Enter test recipients or upload a CSV/TXT file.
- Demonstrate duplicate handling if available.
- Configure the email content and scheduling options.
- Submit the campaign only if the scheduling request succeeds.
- Verify the resulting scheduled records in the dashboard or database.

### 3. Queue Processing and Delivery

- Open the BullMQ Board if it is accessible.
- Show delayed jobs in the queue.
- Allow a test job to execute.
- Verify the resulting email status.
- If using Ethereal SMTP, open the generated preview to inspect the test email.

### 4. Additional Features

Demonstrate rate limiting, Slack notifications, Elasticsearch search, and restart recovery only when you can verify their behavior.

Do not present a feature as working merely because its UI or implementation exists.

## Requirement Acceptance Matrix

This matrix summarizes the intended implementation and verification areas. Confirm each status against actual test results and deployment behavior.

| Requirement | Implementation / verification evidence | Status |
|---|---|---|
| BullMQ delayed scheduling | Scheduling service and end-to-end tests | Verify |
| PostgreSQL persistence | Prisma schema and API tests | Verify |
| Ethereal SMTP | SMTP setup and delivery tests | Verify |
| Atomic Redis rate limiting | Rate-limiter service and tests | Verify |
| Delayed rescheduling on limit | Worker and rate-limiter implementation | Verify |
| Minimum send delay | Redis rate-limit logic | Verify |
| Restart recovery | `SchedulerService.recoverUnscheduledJobs()` | Verify restart behavior |
| Idempotency | Idempotency key and job-status checks | Verify duplicate handling |
| Elasticsearch search and fallback | Search service and end-to-end tests | Verify |
| Slack notifications and deduplication | Slack service and Redis deduplication | Requires valid Slack configuration |
| Google OAuth | Token verification and authentication flow | Requires valid Google configuration |
| BullMQ Board | Queue monitoring endpoint | Verify access and protection |
| React dashboard | Frontend build and dashboard | Verify locally and in deployment |
| CSV/TXT recipient parsing | Recipient parser and tests | Verify parsing results |
| Multi-sender SMTP | Sender routes and SMTP configuration | Verify multiple senders |

## Project Limitations and Configuration

Some integrations depend on external credentials, environment variables, or deployment-specific configuration. A feature being present in the codebase does not necessarily mean it is operational in the current live demo.

The deployed application should be evaluated separately from the locally configured development environment. Remaining deployment issues should be documented accurately rather than described as completed production functionality.

## Security

- Store credentials and API keys in environment variables.
- Do not commit `.env` files containing secrets.
- Restrict access to administrative queue-monitoring interfaces.
- Use appropriate authentication and authorization for production deployments.

## License

Add the license applicable to this project if one has been selected.