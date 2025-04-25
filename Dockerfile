# Use Node.js LTS version
FROM node:20-alpine

# Create app directory
WORKDIR /usr/src/app

# Install app dependencies
COPY package*.json ./
RUN npm install

# Bundle app source
COPY . .

# Build TypeScript code
RUN npm run build

# Create directory for persistent storage
RUN mkdir -p /usr/src/app/data

# Set environment variables
ENV NODE_ENV=production

# Expose port (if needed)
# EXPOSE 3000

# Command to run the application
CMD [ "npm", "start" ] 