# Orator SSL Proxy

> SSL-terminating reverse proxy with host-based routing, local CA, and Let's Encrypt support

Orator SSL Proxy is a Fable service provider that puts HTTPS in front of any set of backend services. It terminates TLS on an HTTPS port, dispatches incoming requests to different backends based on the `Host` header, forwards WebSocket upgrades, and manages certificates automatically with pluggable strategies.

The module exists because putting internal services -- a NAS file browser, a home automation dashboard, a small internal API -- behind HTTPS is otherwise a meaningful chore. Nginx, Caddy, and Traefik all work, but none of them compose naturally with an existing Retold application. `orator-ssl-proxy` is designed to be dropped into an existing Fable app as a service, composed into an Orator-based server, or run completely standalone as a CLI or Docker container.

## Features

- **HTTPS Termination** - Native `https.createServer` with full SNI support for serving multiple certificates from one listener
- **Host-Based Reverse Proxy** - Dispatch by `Host` header with exact, wildcard, and default fall-through matching
- **WebSocket Forwarding** - `upgrade` events routed through the same host router as HTTP
- **Self-Signed With Local CA** - Persistent 10-year local root CA with per-host leaves. Install the root once and every leaf the proxy ever issues is trusted automatically
- **Let's Encrypt** - HTTP-01 automated issuance and timer-driven renewal via `acme-client`
- **File-Based Certs** - Bring-your-own PEM files with per-host overrides
- **Hashed Default Ports** - No `sudo` needed for local dev -- the proxy picks a deterministic high port derived from its package name
- **Multi-Folder Config Chain** - `pict-service-commandlineutility` automatically loads `~/.orator-ssl.config.json`, `./.orator-ssl.config.json`, and `./.config/.orator-ssl.config.json`
- **Prebuilt Docker Image** - Ships a Dockerfile, a compose file, and CLI helpers for building and running

## How It Works

Incoming HTTPS traffic hits Node's native `https.Server`. An SNI callback asks the in-process cert store for the right `SecureContext` for the client-supplied hostname and hands it back to Node, which completes the TLS handshake. The decrypted HTTP request then flows to the host router, which resolves the `Host` header to a backend URL and forwards the unbuffered `IncomingMessage` to that backend through the `http-proxy` library. WebSocket `upgrade` events follow the same routing path but dispatch via `proxy.ws()` instead of `proxy.web()`.

A companion plain-HTTP listener binds port 80 (or a configured alternative) to serve `/.well-known/acme-challenge/*` responses during Let's Encrypt issuance and, optionally, to redirect everything else to HTTPS.

Cert strategies are pluggable and all share one in-memory cert store. Renewals are driven by a background interval that calls `strategy.checkAndRenew()` without interrupting the listening socket -- the SNI callback reads the cert store on every handshake, so new certs become active instantly.

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

Or the same thing from the command line:

```bash
cat > ~/.orator-ssl.config.json <<'EOF'
{
    "certs": { "strategy": "selfsigned" },
    "routes": [{ "host": "awesomeapp.localhost", "target": "http://127.0.0.1:8086" }],
    "default": { "target": "http://127.0.0.1:8080" }
}
EOF

npx orator-ssl-proxy serve
npx orator-ssl-proxy cert-install-root-ca   # one-time trust install
```

## Where to Go Next

- [Quick Start](quickstart.md) -- five-minute walkthrough with a backend and a browser
- [Architecture](architecture.md) -- request lifecycle, sequence diagrams, design trade-offs
- [Configuration Reference](configuration.md) -- every option in the schema with defaults
- [Local Dev That Just Works](local-dev-just-works.md) -- the whole dev-server flow end to end
- [CLI Reference](cli-reference.md) -- every command and flag

## Related Packages

- [orator](https://github.com/fable-retold/orator) - Unopinionated API server abstraction for REST and IPC
- [orator-http-proxy](https://github.com/fable-retold/orator-http-proxy) - Path-based HTTP proxy for Orator applications
- [orator-serviceserver-restify](https://github.com/fable-retold/orator-serviceserver-restify) - Restify service server implementation
- [orator-static-server](https://github.com/fable-retold/orator-static-server) - Static file serving with subdomain routing
- [orator-authentication](https://github.com/fable-retold/orator-authentication) - Cookie-based sessions and OAuth
- [fable](https://github.com/fable-retold/fable) - Service provider framework
- [pict-service-commandlineutility](https://github.com/fable-retold/pict-service-commandlineutility) - CLI framework used by the `orator-ssl-proxy` bin
