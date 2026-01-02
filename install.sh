#!/bin/zsh

# Navigate to your project directory if needed
# cd /path/to/your/project

echo "Starting first NPM script..."
npm run server &
npm run dev &
echo "All scripts finished."