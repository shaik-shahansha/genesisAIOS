#!/bin/sh
# Inject any custom CA certs mounted at /usr/local/share/ca-certificates/custom/
# This allows corporate proxy SSL inspection to work inside the container.
if [ -d /usr/local/share/ca-certificates/custom ]; then
  cat /usr/local/share/ca-certificates/custom/*.crt >> /etc/ssl/certs/ca-certificates.crt 2>/dev/null || true
fi
# Start the Ollama server
exec ollama serve
