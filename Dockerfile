# Triple Sales web (Angular) — build แล้วเสิร์ฟด้วย nginx
#   docker compose up -d --build            (ดู docker-compose.yml)
#   NG_CONFIG = build configuration ใน angular.json: docker = production build + config/docker/app-config.json
# ---------------------------------------------------------------------------
FROM node:22-alpine AS build
WORKDIR /app
# .npmrc มี legacy-peer-deps=true (npm 10.9 ล้มเมื่อไม่มี) — ต้องมาก่อน npm ci
COPY package.json package-lock.json .npmrc ./
RUN npm ci
COPY . .
ARG NG_CONFIG=docker
RUN npx ng build --configuration ${NG_CONFIG}

FROM nginx:1.27-alpine
COPY docker/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist/triple-sale-angular/browser /usr/share/nginx/html
