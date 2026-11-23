# Triple Sales web (Angular) ของ mockup — build ด้วย configuration mockup-tenant (mock + sign-in ของ IdP จำลอง) แล้วเสิร์ฟด้วย nginx
# nginx ใน container ส่ง /mockup-api /mockup-idp /mockup-tps ไป container mockup-data และใส่กุญแจ (x-mockup-token) ให้เอง — กุญแจไม่ไปถึงเบราว์เซอร์
#   docker compose -f docker-compose.mockup-server.yml --env-file .env.mockup-server up -d --build
FROM node:22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json .npmrc ./
RUN npm ci
COPY . .
ARG NG_CONFIG=mockup-tenant
RUN npx ng build --configuration ${NG_CONFIG}
# AI HUB: config/mockup-tenant ตั้ง features.aiHubService=true สำหรับ dev ที่รัน service ai-hub (โหมด mockup) ข้างเครื่อง ; image นี้ไม่มี service
# และ nginx ข้างล่างไม่ส่ง /triplesale/aihub/* ต่อ (เดิมหน้า AI HUB ยิง GET ได้ index.html กลับมา ส่วน POST ตอบ 405) จึงปิดแฟล็กเฉพาะในไฟล์ของ image
# = หน้า AI HUB + หน้า Admin ใช้ mock ในเบราว์เซอร์ (ai-hub.mock.ts / ai-admin.mock.ts) ; ถ้าจะต่อ service จริงให้ตั้ง --build-arg AIHUB_SERVICE=true และเพิ่ม location ใน nginx
ARG AIHUB_SERVICE=false
RUN AIHUB_SERVICE=${AIHUB_SERVICE} node -e "const fs=require('fs');const f='dist/triple-sale-angular/browser/config/app-config.json';const c=JSON.parse(fs.readFileSync(f,'utf8'));c.features=c.features||{};c.features.aiHubService=process.env.AIHUB_SERVICE==='true';fs.writeFileSync(f,JSON.stringify(c,null,2));console.log('aiHubService =',c.features.aiHubService)"

FROM nginx:1.27-alpine
# *.template ถูก envsubst ตอนเริ่ม container (เฉพาะตัวแปรสภาพแวดล้อมที่มีอยู่ — $uri ฯลฯ ของ nginx ไม่ถูกแตะ)
COPY docker/mockup-web/nginx.conf.template /etc/nginx/templates/default.conf.template
COPY --from=build /app/dist/triple-sale-angular/browser /usr/share/nginx/html
