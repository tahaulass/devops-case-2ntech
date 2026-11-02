FROM python:3.12-slim AS build
WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir --prefix=/install -r requirements.txt

FROM python:3.12-slim
ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1
RUN useradd --uid 10001 --no-create-home --shell /usr/sbin/nologin etl
COPY --from=build /install /usr/local
WORKDIR /app
COPY --chown=10001:10001 etl.py .
USER 10001
ENTRYPOINT ["python", "etl.py"]
