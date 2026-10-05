FROM node:20-alpine
WORKDIR /app
COPY server.mjs package.json ./
COPY www ./www
ENV PORT=8080 STATIC_DIR=/app/www NODE_ENV=production
EXPOSE 8080
CMD ["node", "server.mjs"]
