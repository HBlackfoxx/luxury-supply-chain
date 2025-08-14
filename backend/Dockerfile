FROM node:18-alpine

WORKDIR /app

# Copy package.json and package-lock.json
COPY package*.json ./

# Install all dependencies (including dev) since we're using ts-node
RUN npm install

# Copy all source code
COPY . .

# Expose ports
EXPOSE 4000 3002

# Start the server with ts-node
CMD ["npx", "ts-node", "server.ts"]