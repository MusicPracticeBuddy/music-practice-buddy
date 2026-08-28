FROM mcr.microsoft.com/devcontainers/javascript-node:24-bookworm

RUN apt-get update \
    && apt-get install --yes --no-install-recommends \
        libpq-dev \
        postgresql-client \
    && rm -rf /var/lib/apt/lists/*
