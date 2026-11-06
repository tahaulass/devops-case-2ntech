# ---- build: compile the React app to static files ----
FROM node:22-alpine AS build
WORKDIR /app
# Cypress is a devDependency used only in CI; never download its ~500MB binary into the image.
ENV CYPRESS_INSTALL_BINARY=0 \
    CI=true
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY public ./public
COPY src ./src
# Same-origin API path; nginx / the Ingress route /api to the backend.
ARG REACT_APP_API_URL=/api
ENV REACT_APP_API_URL=${REACT_APP_API_URL}
RUN npm run build

# ---- runtime: unprivileged nginx serving static files (no Node in the final image) ----
FROM nginxinc/nginx-unprivileged:stable-alpine
# Upstream for /api proxying (docker-compose). In Kubernetes the Ingress routes /api directly,
# but the proxy also keeps `kubectl port-forward` to the frontend fully functional.
ENV BACKEND_URL=http://backend:5050 \
    NGINX_ENTRYPOINT_LOCAL_RESOLVERS=1
# Apply the latest Alpine security patches on top of the base image: the vulnerability scan
# in CI fails on fixable CRITICAL CVEs, and base images are not rebuilt every day.
USER root
RUN apk upgrade --no-cache
COPY nginx/default.conf.template /etc/nginx/templates/default.conf.template
COPY --from=build /app/build /usr/share/nginx/html
# nginx-unprivileged runs as uid 101 and listens on 8080.
USER 101
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=3s CMD wget -qO- http://127.0.0.1:8080/nginx-health || exit 1
