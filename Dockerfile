# syntax=docker/dockerfile:1
FROM node:22-alpine AS frontend-build
WORKDIR /app/frontend
COPY frontend/package.json ./
COPY frontend/package-lock.json ./
RUN npm ci --ignore-scripts
COPY frontend/ ./
RUN npm run build

FROM rust:1.85-alpine AS svg-hush-build
RUN apk add --no-cache musl-dev
RUN cargo install svg-hush --version 0.9.6 --locked

FROM python:3.12-slim AS runtime
ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1 PYTHONPATH=/app/backend \
    FRIDGEBOARD_DATABASE_URL=sqlite:////data/fridgeboard.db
WORKDIR /app
COPY requirements.lock ./
RUN pip install --no-cache-dir --require-hashes --no-deps -r requirements.lock
COPY alembic.ini ./
COPY backend/ ./backend/
COPY --from=frontend-build /app/frontend/dist ./frontend/dist
COPY --from=svg-hush-build /usr/local/cargo/bin/svg-hush /usr/local/bin/svg-hush
RUN useradd --system --create-home appuser && mkdir -p /data && chown appuser:appuser /data
USER appuser
EXPOSE 8000
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 CMD python -c "import urllib.request; urllib.request.urlopen('http://127.0.0.1:8000/healthz')"
CMD ["python", "-m", "fridgeboard.entrypoint"]
