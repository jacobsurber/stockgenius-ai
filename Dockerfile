# Multi-stage Docker build for StockGenius
FROM node:18-alpine AS builder

# Install build dependencies
RUN apk add --no-cache python3 make g++ sqlite-dev

# Set working directory
WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm ci --only=production && npm cache clean --force

# Copy source code
COPY . .

# Build TypeScript (if using TypeScript build step)
# RUN npm run build

# Production stage
FROM node:18-alpine AS production

# Install runtime dependencies
RUN apk add --no-cache sqlite

# Create app user
RUN addgroup -g 1001 -S nodejs
RUN adduser -S stockgenius -u 1001

# Set working directory
WORKDIR /app

# Copy built application from builder stage
COPY --from=builder --chown=stockgenius:nodejs /app/node_modules ./node_modules
COPY --from=builder --chown=stockgenius:nodejs /app/package*.json ./
COPY --chown=stockgenius:nodejs . .

# Create directories for data and logs
RUN mkdir -p data logs && chown -R stockgenius:nodejs data logs

# Switch to non-root user
USER stockgenius

# Expose port
EXPOSE 3000

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD node scripts/healthcheck.js || exit 1

# Start application
CMD ["npm", "start"]