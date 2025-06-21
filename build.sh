#!/bin/bash

# Build script for Render deployment
# This ensures proper monorepo setup regardless of build directory

echo "🔧 Starting build process..."

# Get the project root directory
if [ -f "package.json" ] && grep -q '"workspaces"' package.json; then
    # Already in root
    PROJECT_ROOT="."
    echo "📁 Building from project root"
elif [ -f "../../package.json" ] && grep -q '"workspaces"' ../../package.json; then
    # In a workspace, go to root
    PROJECT_ROOT="../.."
    echo "📁 Found project root at ../../"
else
    echo "❌ Could not find project root with workspaces"
    exit 1
fi

# Change to project root
cd "$PROJECT_ROOT"

echo "📦 Installing dependencies..."
npm install

echo "🔄 Generating GraphQL types..."
npm run codegen

echo "🏗️ Building server package..."
npm run build -w @listener/server

echo "🎨 Building client package..."
npm run build -w @listener/client

echo "✅ Build completed successfully!" 