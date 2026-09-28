FROM node:24-alpine

# tzdata, damit „heute“ und die Tage am Stück nach deutscher Zeit zählen;
# su-exec, um nach dem Einrichten des Datenordners die Root-Rechte abzugeben
RUN apk add --no-cache tzdata su-exec

WORKDIR /app
ENV NODE_ENV=production \
    PORT=8080 \
    DATA_DIR=/data \
    TZ=Europe/Berlin \
    PUID=99 \
    PGID=100

COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force

COPY server ./server
COPY public ./public
COPY content ./content
COPY docker-entrypoint.sh /usr/local/bin/lernwelt-entrypoint.sh
# Windows-Zeilenenden entfernen, falls die Datei über eine Windows-Freigabe kopiert wurde
RUN sed -i 's/\r$//' /usr/local/bin/lernwelt-entrypoint.sh \
 && chmod +x /usr/local/bin/lernwelt-entrypoint.sh \
 && mkdir -p /data

VOLUME ["/data"]
EXPOSE 8080

HEALTHCHECK --interval=60s --timeout=5s --start-period=10s \
  CMD wget -qO- http://127.0.0.1:8080/api/meta > /dev/null || exit 1

ENTRYPOINT ["/usr/local/bin/lernwelt-entrypoint.sh"]
CMD ["node", "--disable-warning=ExperimentalWarning", "server/index.js"]
