FROM python:3.11-slim-bookworm AS build
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential cmake \
    && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY requirements.txt .
RUN python -m venv /opt/venv \
    && /opt/venv/bin/pip install --no-cache-dir -r requirements.txt

FROM python:3.11-slim-bookworm
RUN apt-get update && apt-get install -y --no-install-recommends \
    libgomp1 \
    && rm -rf /var/lib/apt/lists/*
WORKDIR /app
ENV PATH="/opt/venv/bin:$PATH" PYTHONUNBUFFERED=1
COPY --from=build /opt/venv /opt/venv
COPY *.py ./
CMD ["sh", "-c", "exec gunicorn --bind 0.0.0.0:${PORT:-10000} --workers 1 --timeout 120 --access-logfile - app:app"]
