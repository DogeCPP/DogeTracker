#!/bin/bash
# Run this from the DogeTracker folder on your own machine
# after unzipping, to push to GitHub.
#
# Requires git and a GitHub account that has access to DogeCPP/DogeTracker.
# You can also use a personal access token instead of your password.
#
# Usage:
#   chmod +x push_to_github.sh
#   ./push_to_github.sh
#
# Or manually:
#   git remote add origin https://github.com/DogeCPP/DogeTracker.git
#   git push -u origin main

set -e
echo "Pushing DogeTracker to GitHub..."
if ! git remote get-url origin &>/dev/null; then
  git remote add origin https://github.com/DogeCPP/DogeTracker.git
fi
git push -u origin main
echo "Done. Check https://github.com/DogeCPP/DogeTracker"
