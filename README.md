# RSS Reader

A simple RSS reader application, built with Rust and Next.js. It was scaffolded off [kaleido](https://github.com/ericbutera/kaleido).

![User Interface](./docs/ui.png)

## Quickstart

From the repo root:

```sh
task --list
task ui-next:dev
```

Use `task --list` to discover the current repo-local task surface.

From the workspace root:

```sh
task --list
task rss:ui-next:dev
task rss:ui-next:typecheck
task rss:test
task openapi:rss
```

The Next UI reads browser-facing runtime config from the server at launch. CI builds one UI image, and Pulumi injects deploy-specific values into the container.

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
task deploy:prod
```

From the workspace root:

```sh
task deploy:rss:prod
```

Pulumi remains in `pulumi-iac/rss`, but the human-facing entrypoint should be `task`.

---

## TODO

- [ ] Document OpenAPI generation process
- [ ] Deployment
