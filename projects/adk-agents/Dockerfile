# Multi-stage Dockerfile for ADK agents
# Uses uv for fast package management

FROM python:3.12-slim AS base

# Install system dependencies
RUN apt-get update && apt-get install -y --no-install-recommends \
    curl \
    git \
    && rm -rf /var/lib/apt/lists/*

# Install uv
RUN curl -LsSf https://astral.sh/uv/install.sh | sh
ENV PATH="/root/.local/bin:$PATH"

WORKDIR /app

# Development stage - with hot reload
FROM base AS dev

# Copy project files
COPY pyproject.toml .
COPY src/ src/

# Install dependencies with dev extras
RUN uv sync --extra dev

# Expose port
EXPOSE 8000

# Run with hot reload via watchfiles
# Volume mount src/ for live code changes
CMD ["uv", "run", "uvicorn", "src.main:app", "--host", "0.0.0.0", "--port", "8000", "--reload", "--reload-dir", "src"]


# Production stage - optimized
FROM base AS prod

# Copy project files
COPY pyproject.toml .
COPY src/ src/

# Install production dependencies only
RUN uv sync --no-dev

# Expose port
EXPOSE 8000

# Run with multiple workers
CMD ["uv", "run", "uvicorn", "src.main:app", "--host", "0.0.0.0", "--port", "8000", "--workers", "4"]
