# Docker Server Automation Script

This project is a Node.js-based automation script designed to streamline the process of building, deploying, and uploading artifacts to Application. It also integrates with Redis for logging and monitoring purposes.

## Features

### 1. **Environment Variable Validation**
   - Ensures all required environment variables are present before execution.
   - Validates the following variables:
     - `AWS_ACCESS_KEY_ID`
     - `AWS_SECRET_ACCESS_KEY`
     - `PROJECT_ID`
     - `AVIENT_REDIS_URL`
     - `S3_BUCKET_NAME`

### 2. **Redis Integration for Logging**
   - Uses `ioredis` to publish logs to a Redis channel.
   - Logs are published in JSON format for easy parsing.
   - Example logs include:
     - Command execution details.
     - Standard output (`stdout`) from executed commands.

### 3. **AWS S3 Integration**
   - Uploads files and directories to an S3 bucket.
   - Features include:
     - Retry logic with exponential backoff for failed uploads.
     - Automatic MIME type detection using `mime-types`.
     - Configurable S3 bucket name via environment variables.

### 4. **Shell Command Execution**
   - Executes shell commands with proper error handling.
   - Captures and logs both `stdout` and `stderr` outputs.
   - Provides detailed error messages for failed commands.

### 5. **Recursive Directory Upload**
   - Scans a directory recursively to find all files.
   - Uploads files to S3 with progress tracking.
   - Reports a summary of successful and failed uploads.

### 6. **Build and Deploy Automation**
   - Automates the build and deployment process:
     - Installs dependencies using `npm install`.
     - Builds the project using `npm run build`.
     - Uploads the build artifacts to S3.

### 7. **Error Handling and Cleanup**
   - Handles errors gracefully with detailed error messages.
   - Performs cleanup tasks (e.g., removing temporary files) after execution.

### 8. **Customizable Configuration**
   - Uses a `.env` file for configuration.
   - Allows customization of:
     - AWS credentials.
     - Redis URL.
     - S3 bucket name.
     - Project ID.

## Prerequisites

- Node.js (v14 or higher)
- AWS credentials with permissions to upload to S3.
- Redis server for logging.
- `.env` file with the following variables:
  ```env
  AWS_ACCESS_KEY_ID=your_aws_access_key
  AWS_SECRET_ACCESS_KEY=your_aws_secret_key
  PROJECT_ID=your_project_id
  AVIENT_REDIS_URL=your_redis_url
  S3_BUCKET_NAME=your_bucket_name (optional)