FROM node:20-alpine

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY tsconfig.json ./
COPY src ./src
COPY migrations ./migrations

RUN npm run build

ENV NODE_ENV=production
EXPOSE 3000

CMD ["node", "dist/index.js"]

# Use a secret management system like Vault or AWS Secrets Manager to store sensitive data
ENV POSTGRES_PASSWORD=your_secret_password