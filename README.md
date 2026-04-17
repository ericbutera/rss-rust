# RSS Reader

A simple RSS reader application, built with Rust and Next.js. It was scaffolded off [kaleido](https://github.com/ericbutera/kaleido).

![User Interface](./docs/ui.png)

## Quickstart

From the repo root:

```sh
task ui-next:dev
```

Common repo-local commands:

```sh
task ui-next:typecheck
task ui-next:test
task ui-next:env:staging
task ui-next:env:prod
task api:dev
task worker:dev
task openapi:react-query
```

From the workspace root:

```sh
task rss:ui-next:dev
task rss:ui-next:typecheck
task rss:ui-next:env:staging
task rss:ui-next:env:prod
task rss:test
task openapi:rss
```

Frontend env defaults live in `ui-next/.env.example`.

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

Deployment is wrapped in the repo Taskfile:

```sh
task deploy:staging
task deploy:prod
```

From the workspace root:

```sh
task deploy:rss:staging
task deploy:rss:prod
```

Pulumi remains in `pulumi-iac/rss`, but the human-facing entrypoint should be `task`.

---

## TODO

- [ ] Document OpenAPI generation process
- [ ] Deployment
