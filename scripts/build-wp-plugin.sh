#!/bin/bash
# Clean up existing files
rm -f public/leadflow-official.zip
cd wordpress-plugin
# Create zip with ONLY the leadflow-official folder
zip -r ../public/leadflow-official.zip leadflow-official -x "*.DS_Store*"
cd ..
echo "WordPress plugin zip created successfully in public/leadflow-official.zip"
