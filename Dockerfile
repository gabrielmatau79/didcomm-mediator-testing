# Use a more complete base image for better compatibility with native libraries
FROM node:18-bullseye AS base

# Set working directory inside the container
WORKDIR /app

# Install system dependencies required for native libraries and node-gyp
RUN apt-get update && apt-get install -y \
    python3 \
    make \
    g++ \
    libssl-dev \
    libgcc-s1 \
    libc6 \
    && rm -rf /var/lib/apt/lists/*

# Copy package files first to leverage Docker layer caching
COPY package.json yarn.lock ./

# Install application dependencies
RUN yarn install

# Copy application source code and configuration
COPY ./src ./src
COPY tsconfig.json tsconfig.json
COPY tsconfig.build.json tsconfig.build.json

# Build the application
RUN yarn build

# Define a volume for external configuration files
VOLUME /app/dist/config

# Expose the application port
EXPOSE 3001

# Command to start the application when the container runs
CMD ["yarn", "start"]
