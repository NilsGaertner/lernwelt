FROM node:24-alpine

# tzdata, damit „heute“ und die Tage-am-Stück nach deutscher Zeit zählen
RUN apk add --no-cache tzdata

WORKDIR /app
ENV NODE_ENV=production \
    PORT=8080 \
    DATA_DIR=/data \
    TZ=Europe/Berlin

COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force

COPY server ./server
COPY public ./public
COPY content ./content

RUN mkdir -p /data && chown -R node:node /data
USER node

VOLUME ["/data"]
EXPOSE 8080

HEALTHCHECK --interval=60s --timeout=5s --start-period=10s \
  CMD wget -qO- http://127.0.0.1:8080/api/meta > /dev/null || exit 1

CMD ["node", "--disable-warning=ExperimentalWarning", "server/index.js"]
