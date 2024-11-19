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

| Variable           | Default Value            | Description                                                                                    |
| ------------------ | ------------------------ | ---------------------------------------------------------------------------------------------- |
| `APP_PORT`         | `3001`                   | The port on which the application will run.                                                    |
| `REDIS_URL`        | `redis://localhost:6379` | URL for the Redis instance used for message tracking.                                          |
| `AGENT_PUBLIC_DID` | ``                       | Public DID for agent configuration.                                                            |
| `LOG_LEVEL`        | `1`                      | Log verbosity level: <br> `1` = log, error <br> `2` = log, debug <br> `3` = log, debug, error. |

## Getting Started

### Prerequisites

- Node.js (v18+ recommended)
- Redis (Running locally, accessible remotely)
- Yarn (for dependency management)

### Installation

1. Clone the repository:

```bash
git clone https://github.com/gabrielmatau79/didcomm-mediator-testing.git
cd didcomm-mediator-testing
```

2. Install dependencies:

```bash
yarn install
```

3. Start Redis (if not already running) or use docker compose file

4. Run the application:

```bash
# development
$ yarn run start

# watch mode
$ yarn run start:dev

# production mode
$ yarn run start:prod
```

5. Access Swagger UI:
   Open [http://localhost:3001/doc](http://localhost:3001/doc) in your browser.

## Usage

### Endpoints

1. **Access Swagger UI:**:

- Access the API documentation at [http://localhost:3001/doc](http://localhost:3001/doc) in your browser.

2. **Simulation**:

- Start a simulation with:
  ```
  POST /simulation-test
  ```
  Example payload:
  ```
  {
    "messagesPerConnection": 10,
    "timestampTestInterval": 60000,
    "numAgent": 3,
    "nameAgent": "Agent"
  }
  ```

3. **Metrics**:

- Retrieve messages:
  ```
  GET /simulation-test/messages
  ```
- Retrieve metrics:
  ```
  GET /simulation-test/metrics
  ```
- Retrieve total metrics:
  ```
  GET /simulation-test/metrics/totals
  ```
