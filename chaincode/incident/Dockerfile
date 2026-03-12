FROM node:18-bullseye-slim AS build

WORKDIR /app

COPY package.json package-lock.json tsconfig.json ./
COPY src ./src

RUN npm ci
RUN npm run build

FROM node:18-bullseye-slim

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --omit=dev

COPY --from=build /app/dist ./dist

ENV CHAINCODE_SERVER_ADDRESS=0.0.0.0:9999

EXPOSE 9999

CMD ["npm", "start"]
