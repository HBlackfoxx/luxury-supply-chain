FROM node:18-alpine

WORKDIR /app

# Copy package files
COPY package*.json ./
COPY */package*.json ./
COPY consensus/package*.json ./consensus/
COPY gateway/package*.json ./gateway/
COPY customer/package*.json ./customer/
COPY erp-integration/package*.json ./erp-integration/

# Install dependencies
RUN npm ci --only=production
RUN cd consensus && npm ci --only=production
RUN cd gateway && npm ci --only=production
RUN cd customer && npm ci --only=production
RUN cd erp-integration && npm ci --only=production

# Copy source code
COPY . .

# Build TypeScript
RUN npm run build

# Expose ports
EXPOSE 4000 3002

# Start the server
CMD ["node", "dist/server.js"]