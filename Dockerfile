FROM node:current-alpine

# Create app directory
WORKDIR /usr/src/app

# Install app dependencies
COPY package*.json ./
RUN npm ci --only=production
RUN npm i -g pm2

# Bundle app source
COPY . ./

EXPOSE 3000
CMD [ "pm2-runtime", "start", "index.js" ]