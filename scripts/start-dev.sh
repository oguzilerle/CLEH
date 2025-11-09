#!/bin/bash

# Development startup script
# This script helps set up the development environment

set -e

echo "================================"
echo "CLEH Leaderboard Service Setup"
echo "================================"
echo ""

# Check if Docker is running
if ! docker info > /dev/null 2>&1; then
  echo "❌ Docker is not running. Please start Docker first."
  exit 1
fi

echo "✓ Docker is running"

# Check if node_modules exists
if [ ! -d "node_modules" ]; then
  echo ""
  echo "📦 Installing dependencies..."
  npm install
else
  echo "✓ Dependencies already installed"
fi

# Start Docker containers
echo ""
echo "🐳 Starting Redis and Kafka..."
docker-compose up -d

# Wait for services to be ready
echo ""
echo "⏳ Waiting for services to be ready..."
sleep 5

# Check Redis
echo -n "Checking Redis... "
if redis-cli ping > /dev/null 2>&1; then
  echo "✓ Ready"
else
  echo "❌ Not responding"
fi

# Check Kafka (this might take longer)
echo -n "Checking Kafka... "
for i in {1..10}; do
  if kafka-topics --list --bootstrap-server localhost:9092 > /dev/null 2>&1; then
    echo "✓ Ready"
    break
  fi
  if [ $i -eq 10 ]; then
    echo "⚠️  Still starting... (this is normal)"
  fi
  sleep 1
done

echo ""
echo "================================"
echo "✅ Environment is ready!"
echo "================================"
echo ""
echo "Run the following command to start the server:"
echo "  npm run dev"
echo ""
echo "Or to start in production mode:"
echo "  npm run build && npm start"
echo ""
echo "================================"
echo "Useful Commands:"
echo "================================"
echo ""
echo "Check Redis data:"
echo "  redis-cli"
echo "  > ZREVRANGE global:leaderboard 0 9 WITHSCORES"
echo ""
echo "Check Kafka topics:"
echo "  kafka-topics --list --bootstrap-server localhost:9092"
echo ""
echo "Stop services:"
echo "  docker-compose down"
echo ""
echo "View logs:"
echo "  docker-compose logs -f"
echo ""

