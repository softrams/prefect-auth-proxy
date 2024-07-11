FROM node:18

# Create app directory
WORKDIR /usr/src/app

# Install app dependencies
#COPY package*.json ./
COPY . ./
RUN npm ci --omit=dev
RUN npm i -g pm2

# Bundle app source
#OPY . .

EXPOSE 3000
CMD [ "pm2-runtime", "start", "index.js" ]
