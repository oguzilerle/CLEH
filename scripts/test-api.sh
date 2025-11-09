#!/bin/bash

# Simple API testing script
# Usage: ./scripts/test-api.sh

API_URL="http://localhost:3000/api"

echo "================================"
echo "CLEH Leaderboard API Test"
echo "================================"
echo ""

# Colors
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Test 1: Health Check
echo -e "${YELLOW}Test 1: Health Check${NC}"
response=$(curl -s -w "\n%{http_code}" "$API_URL/health")
http_code=$(echo "$response" | tail -n1)
body=$(echo "$response" | head -n-1)

if [ "$http_code" -eq 200 ]; then
  echo -e "${GREEN}✓ PASSED${NC} - Health check successful"
  echo "$body" | jq '.' 2>/dev/null || echo "$body"
else
  echo -e "${RED}✗ FAILED${NC} - Expected 200, got $http_code"
fi
echo ""

# Test 2: Submit Score
echo -e "${YELLOW}Test 2: Submit Score${NC}"
response=$(curl -s -w "\n%{http_code}" -X POST "$API_URL/scores" \
  -H "Content-Type: application/json" \
  -d '{
    "player_id": "testuser1",
    "score": 1000,
    "timestamp": "2025-11-08T12:00:00.000Z"
  }')
http_code=$(echo "$response" | tail -n1)
body=$(echo "$response" | head -n-1)

if [ "$http_code" -eq 202 ]; then
  echo -e "${GREEN}✓ PASSED${NC} - Score submitted successfully"
  echo "$body" | jq '.' 2>/dev/null || echo "$body"
else
  echo -e "${RED}✗ FAILED${NC} - Expected 202, got $http_code"
fi
echo ""

# Test 3: Submit Multiple Scores
echo -e "${YELLOW}Test 3: Submit Multiple Scores${NC}"
for i in {1..5}; do
  player_id="player$i"
  score=$((1000 + RANDOM % 5000))
  
  curl -s -X POST "$API_URL/scores" \
    -H "Content-Type: application/json" \
    -d "{
      \"player_id\": \"$player_id\",
      \"score\": $score,
      \"timestamp\": \"$(date -u +"%Y-%m-%dT%H:%M:%S.000Z")\"
    }" > /dev/null
  
  echo "  Submitted: $player_id with score $score"
done
echo -e "${GREEN}✓ PASSED${NC} - Multiple scores submitted"
echo ""

# Wait a bit for processing
echo "Waiting 2 seconds for processing..."
sleep 2
echo ""

# Test 4: Get Top Players
echo -e "${YELLOW}Test 4: Get Top Players${NC}"
response=$(curl -s -w "\n%{http_code}" "$API_URL/scores/top?limit=5")
http_code=$(echo "$response" | tail -n1)
body=$(echo "$response" | head -n-1)

if [ "$http_code" -eq 200 ]; then
  echo -e "${GREEN}✓ PASSED${NC} - Top players retrieved"
  echo "$body" | jq '.' 2>/dev/null || echo "$body"
else
  echo -e "${RED}✗ FAILED${NC} - Expected 200, got $http_code"
fi
echo ""

# Test 5: Get Player Stats
echo -e "${YELLOW}Test 5: Get Player Stats${NC}"
response=$(curl -s -w "\n%{http_code}" "$API_URL/scores/player/testuser1")
http_code=$(echo "$response" | tail -n1)
body=$(echo "$response" | head -n-1)

if [ "$http_code" -eq 200 ]; then
  echo -e "${GREEN}✓ PASSED${NC} - Player stats retrieved"
  echo "$body" | jq '.' 2>/dev/null || echo "$body"
else
  echo -e "${RED}✗ FAILED${NC} - Expected 200, got $http_code"
  echo "$body"
fi
echo ""

# Test 6: Get Leaderboard Stats
echo -e "${YELLOW}Test 6: Get Leaderboard Stats${NC}"
response=$(curl -s -w "\n%{http_code}" "$API_URL/scores/stats")
http_code=$(echo "$response" | tail -n1)
body=$(echo "$response" | head -n-1)

if [ "$http_code" -eq 200 ]; then
  echo -e "${GREEN}✓ PASSED${NC} - Leaderboard stats retrieved"
  echo "$body" | jq '.' 2>/dev/null || echo "$body"
else
  echo -e "${RED}✗ FAILED${NC} - Expected 200, got $http_code"
fi
echo ""

# Test 7: Invalid Request
echo -e "${YELLOW}Test 7: Invalid Request (Missing Fields)${NC}"
response=$(curl -s -w "\n%{http_code}" -X POST "$API_URL/scores" \
  -H "Content-Type: application/json" \
  -d '{
    "player_id": "testuser"
  }')
http_code=$(echo "$response" | tail -n1)
body=$(echo "$response" | head -n-1)

if [ "$http_code" -eq 400 ]; then
  echo -e "${GREEN}✓ PASSED${NC} - Validation error caught"
  echo "$body" | jq '.' 2>/dev/null || echo "$body"
else
  echo -e "${RED}✗ FAILED${NC} - Expected 400, got $http_code"
fi
echo ""

echo "================================"
echo "Test Suite Complete"
echo "================================"

