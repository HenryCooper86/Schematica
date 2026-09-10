FROM node:22-bookworm-slim
WORKDIR /app
ENV NODE_ENV=production HOST=0.0.0.0 PORT=3000
COPY package.json index.html ./
COPY server ./server
COPY src ./src
COPY css ./css
COPY vendor ./vendor
USER node
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s CMD node server/healthcheck.js
CMD ["node", "server/index.js"]
