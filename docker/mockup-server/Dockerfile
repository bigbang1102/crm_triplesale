# The file server of the mockup (Datasource/ + Storage/) shared by every developer — no dependency, plain Node.
#   docker compose -f docker-compose.mockup-server.yml --env-file .env.mockup-server up -d --build
# Build context = the project root (see docker-compose.mockup-server.yml).
FROM node:22-alpine
WORKDIR /app
COPY tools/mockup-server.mjs ./tools/mockup-server.mjs
COPY tools/lib/mockup-idp.mjs ./tools/lib/mockup-idp.mjs
# no copy of the data in the image: /data is the volume (the host folder D:\mockup-data); fill it with `npm run mockup:seed`
COPY docker/mockup-server/entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh && mkdir -p /data/Datasource /data/Storage && chown -R node:node /data
ENV MOCKUP_HOST=0.0.0.0 \
    MOCKUP_PORT=4310 \
    MOCKUP_DATASOURCE=/data/Datasource \
    MOCKUP_STORAGE=/data/Storage
EXPOSE 4310
USER node
HEALTHCHECK --interval=30s --timeout=5s --retries=3 CMD wget -qO- http://127.0.0.1:4310/mockup-api/health || exit 1
ENTRYPOINT ["/entrypoint.sh"]
CMD ["node", "tools/mockup-server.mjs"]
