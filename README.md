# Didcomm Mediator Testing

This application is a NestJS-based messaging simulation system designed for testing of Didcomm Mediator and benchmarking message delivery between multiple agents. It leverages Redis for message tracking and provides metrics for message performance.

## Features

1. **Agent Management**:

   - Dynamic creation and cleanup of agents.
   - Establishes connections between all agents.

2. **Message Simulation**:

   - Configurable parameters for number of agents, messages per connection, and simulation duration.
   - Concurrent and randomized message delivery.

3. **Metrics and Tracking**:

   - Tracks messages and their processing times in Redis.
   - Provides detailed metrics for message performance.

4. **Swagger Integration**:
   - Fully documented API endpoints using Swagger.

## Environment Variables

Below are the environment variables supported by the application. These can be set in a `.env` file in the project root.

| Variable                        | Default Value            | Description                                                                    |
| ------------------------------- | ------------------------ | ------------------------------------------------------------------------------ |
| `APP_PORT`                      | `3001`                   | The port on which the application will run.                                    |
| `REDIS_URL`                     | `redis://localhost:6379` | URL for the Redis instance used for message tracking.                          |
| `AGENT_PUBLIC_DID`              | ``                       | Public DID for agent configuration.                                            |
| `LOG_LEVEL`                     | `1`                      | Log verbosity level: `1` = log, error `2` = log, debu `3` = log, debug, error. |
| `ENABLE_AGENT_LOGS`             | `true`                   | Enable per-agent log files and event handlers.                                 |
| `MAX_TENANTS`                   | `50`                     | Maximum number of tenants allowed simultaneously.                              |
| `MAX_CONCURRENT_MESSAGES`       | `5`                      | Maximum concurrent message sends per agent during simulations.                 |
| `AGENT_CLEANUP_DELAY_MS`        | `10000`                  | Delay (ms) before deleting agents/wallets after a test.                        |
| `MAX_CONCURRENT_AGENT_CREATION` | `2`                      | Maximum number of agents created concurrently during simulations.              |
| `REPORTS_DIR`                   | `./reports`              | Directory where report files are stored.                                       |


## Getting Started

### Prerequisites

- Node.js (v22+ recommended)
- Redis (Running locally, accessible remotely)
- pnpm (for dependency management)

### Installation

1. Clone the repository:

```bash
git clone https://github.com/gabrielmatau79/didcomm-mediator-testing.git
cd didcomm-mediator-testing
```

1. Install dependencies:

```bash
pnpm install
```

1. Start Redis (if not already running) or use docker compose file

1. Run the application:

```bash
# development
$ pnpm start

# watch mode
$ pnpm start:dev

# production mode
$ pnpm start:prod
```

1. Access Swagger UI:
   Open [http://localhost:3001/doc](http://localhost:3001/doc) in your browser.

## Usage

### Endpoints

1. **Access Swagger UI:**:

- Access the API documentation at [http://localhost:3001/doc](http://localhost:3001/doc) in your browser.

1. **Simulation**:

- Start a simulation with:

  ```api
  POST /simulation-test
  ```

  The response includes a `testId` you can use to query messages, metrics, and reports.

  Example payload:

  ```api
  {
    "messagesPerConnection": 10,
    "timestampTestInterval": 60000,
    "numAgent": 3,
    "nameAgent": "Agent",
    "testName": "Load Test - Mediator v1",
    "testDescription": "Baseline test for mediator throughput"
  }
  ```

1. **Metrics**:

- Retrieve messages by test ID:

  ```api
  GET /simulation-test/messages/:testId
  ```

- Retrieve metrics by test ID:

  ```api
  GET /simulation-test/metrics/:testId
  ```

- Retrieve total metrics by test ID:

  ```api
  GET /simulation-test/metrics/:testId/totals
  ```

1. **Reports**:

- Generate and download a report:

  ```api
  GET /simulation-test/reports/:testId
  ```

  Reports are also written locally to `reports/report-<testId>.json`.

- Download consolidated report (config + totals + messages):

  ```api
  GET /simulation-test/reports/:testId/consolidated
  ```

  Consolidated reports are also written locally to `reports/report-<testId>-consolidated.json`.

1. **Tests**:

- List all tests stored in Redis:

  ```api
  GET /simulation-test/tests
  ```

1. **Activate tenants**:

- Create tenants for a test to receive delayed messages, then auto-delete:

  ```api
  POST /simulation-test/activate/:testId
  ```

  Optional payload:

  ```api
  {
    "cleanupDelayMs": 10000
  }
  ```

1. **Stop a running test**:

- Request stop for a running simulation:

  ```api
  POST /simulation-test/stop/:testId
  ```

## Docker Setup

### Building the Docker Image

To build the Docker image for this application, use the following command:

```bash
docker build -t didcomm-mediator-testing:test .
```

### Using Docker Compose

Create loadbalancing network if you don`t have:

```bash
docker network create loadbalancing
```

To run the application with Docker Compose, execute:

```bash
docker-compose up --build
```

This command will:

- Build the application image.
- Start the application and Redis services.
- Expose the application on <http://localhost:3001>

### Stopping the Services

To stop and remove the containers, run:

```bash
docker-compose down
```
