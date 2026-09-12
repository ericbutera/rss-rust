# RSS Reader

A simple RSS reader application, built with Rust and Next.js. It was scaffolded off [kaleido](https://github.com/ericbutera/kaleido).

![User Interface](./docs/ui.png)

## Quickstart

From the repo root:

```sh
mise tasks
mise run ui-next:dev
```

Use `mise tasks` to discover the current repo-local command surface.

The Next UI reads browser-facing runtime config from the server at launch. CI builds one UI image, and Pulumi injects deploy-specific values into the container.

## Kaleido Dependency

Kaleido updates are explicit in this repo:

```sh
mise run kaleido:status
VERSION=0.8.5 mise run kaleido:update
```

The update task updates `ui-next/package.json` and `ui-next/pnpm-lock.yaml`, then runs the frontend typecheck. Rust Kaleido is still sourced through the local/git Cargo patch model used by this app.

## Architecture

```mermaid
flowchart LR
    subgraph Client
        Browser
    end

    subgraph Frontend["Next.js"]
        UI
    end

    subgraph Backend["Rust"]
        API
        Worker
    end

    subgraph Storage
        DB[(PostgreSQL)]
        Disk
    end

    subgraph AI["AI"]
        Ollama["Ollama (Qwen 2.5 3B)"]
    end

    Browser -->|HTTP| UI
    UI --> API
    API --> DB
    API --> Disk
    Disk --> |Backup| S3
    Worker --> DB
    Worker --> Ollama
```

## CI/CD

The project uses [woodpecker-ci](https://woodpecker-ci.org/) with pipelines defined at [.woodpecker](./.woodpecker).

## Deployment

Deployment is wrapped in the repo mise tasks:

```sh
mise run deploy:prod
```

Pulumi remains in `pulumi-iac/rss`, but the human-facing entrypoint should be `mise`.

---

## TODO

- [ ] Document OpenAPI generation process
- [ ] Deployment
