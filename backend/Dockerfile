FROM python:3.12.8-slim

WORKDIR /app

# Install curl (healthcheck) + fonts-dejavu (PDF reports need ₹ glyph)
RUN apt-get update && apt-get install -y --no-install-recommends curl fonts-dejavu && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

# Build provenance — baked into image at build time, exposed via /api/system-health/version.
# Lets the mobile app know exactly what code version is running and what schema head it expects,
# so rollback can refuse mismatches before they break the live system.
ARG GIT_SHA="unknown"
ARG BUILD_TS="unknown"
ARG ALEMBIC_HEAD="unknown"
ARG IMAGE_TAG="latest"
ENV BUILD_GIT_SHA=$GIT_SHA \
    BUILD_TS=$BUILD_TS \
    BUILD_ALEMBIC_HEAD=$ALEMBIC_HEAD \
    BUILD_IMAGE_TAG=$IMAGE_TAG

# Run as non-root
RUN useradd -m -u 1000 appuser && chown -R appuser:appuser /app
USER appuser

EXPOSE 8000

HEALTHCHECK --interval=30s --timeout=10s --start-period=15s --retries=3 \
    CMD curl --fail http://localhost:8000/health || exit 1

CMD ["gunicorn", "-c", "gunicorn.conf.py", "app.main:app"]
