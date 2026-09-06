FROM node:20-alpine

WORKDIR /usr/src/app

COPY package*.json ./
# Change npm ci to npm install --omit=dev
RUN npm install --omit=dev

COPY . .

EXPOSE 3000

CMD ["node", "index.js"]
