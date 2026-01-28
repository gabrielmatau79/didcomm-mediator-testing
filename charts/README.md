# DIDComm Mediator Testing Helm Chart

This chart deploys the didcomm-mediator-testing NestJS service as a Deployment with a Service, optional ingress, configurable environment variables, and node scheduling controls.

## Features

- Deploys the API service with configurable image repo/tag and replica count.
- Exposes the app via ClusterIP service; optional ingress block if you need it.
- Captures all required env vars from docker-compose/k8s manifests with override support.
- Allows nodeSelector and resource overrides.

## Kubernetes Resources

- Service (ClusterIP by default)
- Deployment
- Redis Service + Deployment
- Optional Ingress (disabled by default)

## Configuration

| Parameter            | Description                                | Default                                           |
| -------------------- | ------------------------------------------ | ------------------------------------------------- |
| `name`               | Application name/labels                    | `didcomm-mediator-testing`                        |
| `replicas`           | Deployment replicas                        | `1`                                               |
| `image.repository`   | Image repository                           | `gabrielmatau79/didcomm-mediator-testing`         |
| `image.tag`          | Image tag                                  | `latest`                                          |
| `image.pullPolicy`   | Image pull policy                          | `IfNotPresent`                                    |
| `service.type`       | Service type                               | `ClusterIP`                                       |
| `service.port`       | Service port                               | `3001`                                            |
| `service.targetPort` | Container port                             | `3001`                                            |
| `nodeSelector`       | Node selector map                          | `kubernetes.io/hostname: cluster-utc-node-07efe5` |
| `env`                | Required env vars (see below)              | default values                                    |
| `extraEnv`           | Additional env entries (`[{name, value}]`) | `[]`                                              |
| `resources`          | Pod resources                              | `{}`                                              |
| `ingress.enabled`    | Enable ingress                             | `false`                                           |
| `redis`              | Redis chart values                         | see values.yaml                                   |

### Required environment variables

Defined under `env` with default values; override per environment:

- `APP_PORT`
- `REDIS_URL`
- `AGENT_PUBLIC_DID`
- `LOG_LEVEL`
- `ENABLE_AGENT_LOGS`
- `MAX_TENANTS`
- `MAX_CONCURRENT_MESSAGES`
- `AGENT_CLEANUP_DELAY_MS`
- `MAX_CONCURRENT_AGENT_CREATION`
- `REPORTS_DIR`
- Redis is deployed by default as `didcomm-mediator-testing-redis` and the app points to it via `REDIS_URL`.
- A PVC is created for Redis data at `redis.persistence.claimName` (default: `didcomm-mediator-testing-redis-pvc`).

### Quick examples

Render:

```bash
helm template ./charts
```

Install/upgrade (override image tag and a couple env vars):

```bash
helm upgrade --install didcomm-mediator-testing ./charts \
  -n <namespace> \
  --set global.domain=example.com \
  --set image.repository=gabrielmatau79/didcomm-mediator-testing \
  --set image.tag=latest \
  --set env.REDIS_URL=redis://didcomm-mediator-testing-redis:6379
```
