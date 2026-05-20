# orator-ssl-proxy — SSL-terminating reverse proxy

FROM node:22-slim

RUN apt-get update \
    && apt-get install -y --no-install-recommends ca-certificates openssl \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy manifest first for layer caching
COPY package.json package-lock.json* ./

# No postinstall scripts required; --ignore-scripts avoids surprises
RUN (npm ci --omit=dev --no-audit --no-fund --ignore-scripts \
        || npm install --omit=dev --no-audit --no-fund --ignore-scripts) \
    && npm cache clean --force

# Copy runtime source only
COPY source/ source/

# XDG-style mount points and runtime env
#   /config — mounted config directory (contains .orator-ssl.config.json)
#   /certs  — persistent cert storage (CRITICAL for Let's Encrypt continuity)
ENV XDG_CONFIG_HOME=/config \
    XDG_DATA_HOME=/data \
    NODE_ENV=production

RUN mkdir -p /config /certs /data

EXPOSE 80 443

# Healthcheck: TCP connect to port 443
HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 \
    CMD node -e "require('net').createConnection(443,'127.0.0.1').on('connect',()=>process.exit(0)).on('error',()=>process.exit(1))"

CMD ["node", "source/cli/OratorSSLProxy-CLI-Run.js", "serve", \
     "--config", "/config/.orator-ssl.config.json", \
     "--certs-path", "/certs", \
     "--https-port", "443", \
     "--http-port", "80"]
