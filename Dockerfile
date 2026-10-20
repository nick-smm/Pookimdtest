FROM node:20-slim

RUN apt-get update \
    && apt-get install -y --no-install-recommends ffmpeg git ca-certificates \
    && rm -rf /var/lib/apt/lists/*

ENV NODE_ENV=production
WORKDIR /app

COPY package.json ./
RUN npm install --omit=dev && npm cache clean --force

COPY . .

RUN mkdir -p /app/sessions
VOLUME ["/app/sessions"]

ENV PORT=3000
EXPOSE 3000

CMD ["node", "pair.js"]
