# Orator SSL Proxy

> **[&#9654; Read the Orator-Ssl-Proxy Documentation](https://fable-retold.github.io/orator-ssl-proxy/)** &mdash; interactive docs with the full API reference.

> SSL-terminating reverse proxy with host-based routing, local CA, and Let's Encrypt support

Orator SSL Proxy is a Fable service provider that puts HTTPS in front of any set of backend services. It terminates TLS on an HTTPS port, dispatches incoming requests to different backends based on the `Host` header, forwards WebSocket upgrades, and manages certificates automatically with pluggable strategies -- a trusted local CA for dev and home networks, Let's Encrypt for production, or user-supplied PEM files when you already have certificates.

It runs as a composable Fable service inside any Retold application, as a standalone local CLI for development and home-network use, or as a prebuilt Docker image for production. Hot-path traffic goes directly through native Node `https` and the `http-proxy` library so request and response bodies stream byte-for-byte without buffering.

## Features

- **HTTPS Termination** - Native `https.createServer` with full SNI support for serving multiple certificates from one listener
- **Host-Based Reverse Proxy** - Route incoming requests to different backends by `Host` header, with exact and wildcard matching and a default fall-through target
- **WebSocket Forwarding** - `upgrade` events routed through the same host router as HTTP
- **Self-Signed With Local CA** - Generates a persistent 10-year local root CA and signs per-host leaf certs from it. Install the root once into your OS trust store and every leaf the proxy ever issues is automatically trusted by browsers
- **Let's Encrypt** - Automated HTTP-01 issuance and timer-driven renewal via `acme-client`, with an optional self-signed bootstrap placeholder for the first-issuance window
- **File-Based Certs** - Point at your own PEM files for preexisting certificates; per-host overrides are supported
- **Hashed Default Ports** - Local dev binds to deterministic high ports derived from the package name, so no `sudo` is required on macOS or Linux
- **Multi-Folder Config Chain** - `~/.orator-ssl.config.json`, `./.orator-ssl.config.json`, and `./.config/.orator-ssl.config.json` are all loaded automatically via `pict-service-commandlineutility`
- **First-Class Docker Image** - Prebuilt container image with `/config` and `/certs` volume mounts on standard ports 443 and 80
- **Fable Integration** - Standard Fable service provider with lifecycle, logging, and configuration

## Quick Start

```javascript
const libFable = require('fable');
const libOratorSSLProxy = require('orator-ssl-proxy');

const _Fable = new libFable(
    {
        Product: 'MyGateway',
        ProductVersion: '1.0.0'
    });

_Fable.serviceManager.addServiceType('OratorSSLProxy', libOratorSSLProxy);

let _Proxy = _Fable.serviceManager.instantiateServiceProvider('OratorSSLProxy',
    {
        Configuration:
        {
            certs: { strategy: 'selfsigned' },
            routes:
                [
                    { host: 'awesomeapp.localhost', target: 'http://127.0.0.1:8086' }
                ],
            default: { target: 'http://127.0.0.1:8080' }
        }
    });

_Proxy.start(
    () =>
    {
        console.log('orator-ssl-proxy running on', _Proxy.httpsServer.address());
    });
```

Or run it standalone from the command line:

```bash
# Write a config file
cat > ~/.orator-ssl.config.json <<'EOF'
{
    "certs": { "strategy": "selfsigned" },
    "routes": [{ "host": "awesomeapp.localhost", "target": "http://127.0.0.1:8086" }],
    "default": { "target": "http://127.0.0.1:8080" }
}
EOF

# Start the proxy (hashed high ports, no sudo)
npx orator-ssl-proxy serve

# (Optional) Install the local CA root so browsers trust the self-signed leaves
npx orator-ssl-proxy cert-install-root-ca
```

Browse to `https://awesomeapp.localhost:<port>/` (the port is printed at startup).

## Installation

```bash
npm install orator-ssl-proxy
```

No peer dependencies on `orator` or `orator-serviceserver-restify` -- the hot path uses raw Node `http`/`https` and talks to `http-proxy` directly, so the module is self-contained.

## Cert Strategies

### `selfsigned` (default)

Two sub-modes, both built on `node-forge` with no external binaries:

- **`localCA`** (default, recommended) -- generates a persistent 10-year local root CA and signs per-host leaf certs from it. Install the CA root once into your OS trust store via `cert-install-root-ca` and every leaf the proxy ever issues is automatically trusted by browsers. This is the `mkcert`-style pattern, implemented in-process.
- **`adhoc`** -- one-off standalone self-signed cert per host, no CA. Browser will always show a warning. Use for curl/automation contexts where nobody is looking at a browser.

### `letsencrypt`

Automated issuance via ACME HTTP-01 using the `acme-client` npm package. Requires:

- Port 80 reachable from the public internet
- Public DNS names resolving to the host
- `certs.letsencrypt.email` set in config

Defaults to the staging environment. Set `certs.letsencrypt.staging: false` for production -- note the rate limits (50 certs / registered domain / week).

### `file`

Point at your own PEM files. No generation, no renewal -- just load them. Supports per-host overrides alongside a default cert.

## Docker

```bash
# Build the image from the shipped Dockerfile
npx orator-ssl-proxy docker-build

# Run it on standard ports 443/80 with the default mounts
npx orator-ssl-proxy docker-run
```

Mounts applied automatically:

- `~/.orator-ssl.config.json` -> `/config/.orator-ssl.config.json` (read-only)
- `~/.orator-ssl/certs/` -> `/certs` (persistent -- **required** for Let's Encrypt continuity)

## Configuration

Configuration lives in `~/.orator-ssl.config.json` (and/or `./.orator-ssl.config.json` and `./.config/.orator-ssl.config.json` -- all three locations are loaded and deep-merged by the `pict-service-commandlineutility` config loader):

```json
{
    "https": { "port": null, "host": "0.0.0.0" },
    "http":  { "port": null, "host": "0.0.0.0", "redirectToHttps": true },
    "certs":
    {
        "strategy": "selfsigned",
        "storagePath": "~/.orator-ssl/certs",
        "selfsigned": { "mode": "localCA" }
    },
    "routes":
        [
            { "host": "awesomeapp.localhost", "target": "http://127.0.0.1:8086" }
        ],
    "default": { "target": "http://127.0.0.1:8080" }
}
```

`null` ports mean "use the hashed default derived from the package name" (lands in the 13000-16999 range). Run `npx orator-ssl-proxy explain-config` for a live dump of all configurable keys.

## Documentation

Full documentation is available in the [`docs`](./docs) folder, or served locally:

- [Overview](docs/README.md) - What it is, what it solves, how it fits together
- [Quick Start](docs/quickstart.md) - Up and running in five minutes
- [Architecture](docs/architecture.md) - System design with sequence diagrams
- [Configuration Reference](docs/configuration.md) - Full schema reference
- [CLI Reference](docs/cli-reference.md) - All commands with options
- [API Reference](docs/api-reference.md) - Every public method and property
- [Docker Deployment](docs/docker.md) - Container image, mounts, and compose
- **Configuration Recipes**
  - [Self-Signed with Local CA](docs/config-selfsigned-localca.md) - Recommended for dev and internal tools
  - [Self-Signed Ad-Hoc](docs/config-selfsigned-adhoc.md) - Throwaway certs for automation
  - [Let's Encrypt](docs/config-letsencrypt.md) - Production-grade automated certs
  - [File-Based Certs](docs/config-file-certs.md) - Bring your own PEMs
- **Local Dev That Just Works**
  - [Setup Guide](docs/local-dev-just-works.md) - The whole flow end to end
  - [Install Local CA on macOS](docs/install-ca-mac.md)
  - [Install Local CA on Windows](docs/install-ca-windows.md)
  - [Install Local CA on Ubuntu](docs/install-ca-ubuntu.md)
  - [Install Local CA on iPhone and iPad](docs/install-ca-ios.md)

## Testing

```bash
npm test
```

## Related Packages

- [orator](https://github.com/fable-retold/orator) - Unopinionated API server abstraction for REST and IPC
- [orator-http-proxy](https://github.com/fable-retold/orator-http-proxy) - Path-based HTTP proxy for Orator applications
- [orator-serviceserver-restify](https://github.com/fable-retold/orator-serviceserver-restify) - Restify service server implementation
- [orator-static-server](https://github.com/fable-retold/orator-static-server) - Static file serving with subdomain routing
- [orator-authentication](https://github.com/fable-retold/orator-authentication) - Cookie-based sessions and OAuth
- [fable](https://github.com/fable-retold/fable) - Service provider framework
- [pict-service-commandlineutility](https://github.com/fable-retold/pict-service-commandlineutility) - CLI framework used for the `orator-ssl-proxy` bin

## License

MIT

## Contributing

Pull requests are welcome. For details on our code of conduct, contribution process, and testing requirements, see the [Retold Contributing Guide](https://github.com/stevenvelozo/retold/blob/main/docs/contributing.md).
