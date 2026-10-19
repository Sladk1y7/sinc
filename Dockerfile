FROM node:24-alpine
WORKDIR /app

COPY package.json package-lock.json ./
COPY apps/server/package.json apps/server/package.json
COPY packages/shared/package.json packages/shared/package.json
COPY packages/shared packages/shared
COPY apps/server apps/server

RUN npm ci --workspace @sinc/server --workspace @sinc/shared --include-workspace-root \
  && npm run prisma:generate --workspace @sinc/server

WORKDIR /app/apps/server
ENV PORT=4000
EXPOSE 4000
CMD ["npm", "run", "start"]
