const { exec } = require('child_process');
const path = require('path');
const fs = require('fs');
const { S3Client, PutObjectCommand } = require('@aws-sdk/client-s3');
const mime = require('mime-types');
const io = require('ioredis');
const { error } = require('console');
require('dotenv').config({ path: path.join(__dirname, '.env') });

// apply publisher here set the logs
const publisher = new io(process.env.AVIENT_REDIS_URL)

const s3 = new S3Client({
  region: 'ap-south-1',

  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY
  }
});

function publishing({ logs, channels = process.env.PROJECT_ID }) {
  console.log('Publishing logs to Redis:', channels, logs);
  publisher.publish(`logs:${channels}`, JSON.stringify(logs));
}

// Validate required environment variables
function validateEnvironment() {
  const requiredVars = ['AWS_ACCESS_KEY_ID', 'AWS_SECRET_ACCESS_KEY', 'PROJECT_ID'];
  const missing = requiredVars.filter(varName => !process.env[varName]);

  if (missing.length > 0) {
    throw new Error(`Missing required environment variables: ${missing.join(', ')}`);
  }

  publishing({ logs: `Validated environment variables: ${requiredVars.join(', ')}` });

  return process.env.PROJECT_ID;
}

// Execute shell command with proper error handling
function executeCommand(command, cwd) {
  return new Promise((resolve, reject) => {
    console.log(`Executing: ${command} in ${cwd}`);
    publishing({ logs: `Executing: ${command} in ${cwd}` });

    const process = exec(command, { cwd });

    process.stdout.on('data', (data) => {
      console.log(`[stdout] ${data.toString().trim()}`);
      publishing({ logs: data.toString().trim() });
    });

    process.stderr.on('data', (data) => {
      console.error(`[stderr] ${data.toString().trim()}`);
      publishing({ logs: data.toString().trim() });
    });

    process.on('error', (error) => {
      console.error(`Execution error: ${error.message}`);
      publishing({ logs: `Execution error: ${error.message}` });
      reject(error);
    });

    process.on('close', (code) => {
      console.log(`Command exited with code ${code}`);
      publishing({ logs: `Command exited with code ${code}` });
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`Command failed with exit code ${code}`));
      }
    });
  });
}

// Upload a single file to S3
//uploading to s3 always give path of file not folder
async function uploadFile(fullPath, relativePath, projectId) {
  const retries = 3;

  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      // Read the file content into memory instead of streaming
      const fileContent = fs.readFileSync(fullPath);

      publishing({ logs: `Uploading file: ${relativePath}`, channels: 'log' });

      const command = new PutObjectCommand({
        Bucket: 'gitku',
        Key: `__output/${projectId}/${relativePath}`,
        Body: fileContent,
        ContentType: mime.lookup(fullPath) || 'application/octet-stream'
      });

      const data = await s3.send(command);
      console.log(`Successfully uploaded: ${relativePath}`);
      publishing({ logs: `Successfully uploaded: ${relativePath}`, channels: 'log' });
      return data;
    } catch (error) {
      console.error(`Upload attempt ${attempt}/${retries} failed for ${relativePath}:`, error.message);
      publishing({ logs: `Upload attempt ${attempt}/${retries} failed for ${relativePath}: ${error.message}`, channels: 'log' });

      if (attempt === retries) {
        throw error;
      }

      // Wait before retrying (exponential backoff)
      await new Promise(r => setTimeout(r, 1000 * attempt));
    }
  }
}


// Upload all files in directory
async function uploadDirectory(directory, projectId) {
  console.log(`Starting upload from ${directory} for project ${projectId}`);
  publishing({ logs: `Starting upload from ${directory} for project ${projectId}`, channels: 'log' });

  try {
    // Check if directory exists
    if (!fs.existsSync(directory)) {
      throw new Error(`Distribution directory not found: ${directory}`);
    }

    // Get all files recursively
    const files = [];

    function getAllFiles(dirPath) {
      const entries = fs.readdirSync(dirPath, { withFileTypes: true });

      for (const entry of entries) {
        const fullPath = path.join(dirPath, entry.name);

        if (entry.isDirectory()) {
          getAllFiles(fullPath);
        } else {
          files.push(fullPath);
        }
      }
    }

    getAllFiles(directory);
    console.log(`Found ${files.length} files to upload`);
    publishing({ logs: `Found ${files.length} files to upload`, channels: 'log' });

    // Upload files with progress tracking
    const results = [];
    let uploadedCount = 0;

    for (const fullPath of files) {
      // Create the relative path correctly by removing the base directory
      const relativePath = path.relative(directory, fullPath);

      try {
        const result = await uploadFile(fullPath, relativePath, projectId);
        results.push({ file: relativePath, success: true });
      } catch (error) {
        results.push({ file: relativePath, success: false, error: error.message });
      }

      uploadedCount++;
      if (uploadedCount % 10 === 0 || uploadedCount === files.length) {
        console.log(`Progress: ${uploadedCount}/${files.length} files processed`);
        publishing({ logs: `Progress: ${uploadedCount}/${files.length} files processed`, channels: 'log' });
      }
    }

    // Report summary
    const successful = results.filter(r => r.success).length;
    console.log(`Upload complete: ${successful}/${results.length} successful`);
    publishing({ logs: `Upload complete: ${successful}/${results.length} successful`, channels: 'log' });

    if (successful < results.length) {
      const failed = results.filter(r => !r.success);
      console.error(`Failed uploads (${failed.length}):`, failed.map(f => f.file).join(', '));
      publishing({ logs: `Failed uploads (${failed.length}): ${failed.map(f => f.file).join(', ')}`, channels: 'log' });
      throw new Error(`${failed.length} files failed to upload`);
    }

    return results;
  } catch (error) {
    console.error('Error during directory upload:', error);
    publishing({ logs: `Error during directory upload: ${error.message}`, channels: 'log' });
    throw error;
  }
}

// Main function with proper cleanup
async function init() {
  let exitCode = 0;
  let projectId;

  try {
    console.log('Starting build and deploy process');
    publishing({ logs: 'Starting build and deploy process', channels: 'log' });

    // Validate environment
    projectId = validateEnvironment();

    // Setup paths
    const outputDir = path.join(__dirname, 'output');
    const distDir = path.join(outputDir, 'dist');

    // Ensure output directory exists
    if (!fs.existsSync(outputDir)) {
      throw new Error(`Output directory not found: ${outputDir}`);
    }

    // Execute build commands
    await executeCommand('npm install', outputDir);
    await executeCommand('npm run build', outputDir);

    // Upload artifacts
    await uploadDirectory(distDir, projectId);

    console.log('Build and deploy completed successfully');
    publishing({ logs: 'Build and deploy completed successfully', channels: 'log' });
  } catch (error) {
    console.error('Build and deploy failed:', error);
    publishing({ logs: `Build and deploy failed: ${error.message}`, channels: 'log' });
    exitCode = 1;
  } finally {
    // Cleanup (e.g., temporary files, connections)
    try {
      console.log('Performing cleanup');
      publishing({ logs: 'Performing cleanup', channels: 'log' });
      // Add any cleanup code here if needed

      // For example, you might want to remove any temporary files:
      // const tempDir = path.join(__dirname, 'temp');
      // if (fs.existsSync(tempDir)) {
      //     fs.rmSync(tempDir, { recursive: true, force: true });
      // }
    } catch (cleanupError) {
      console.error('Error during cleanup:', cleanupError);
      publishing({ logs: `Error during cleanup: ${cleanupError.message}`, channels: 'log' });
      // Don't override the main error code
      if (exitCode === 0) exitCode = 1;
    }

    // Exit with appropriate code
    console.log(`Exiting with code ${exitCode}`);
    process.exit(exitCode);
  }
}

// Start the process
init().catch(error => {
  console.error('Unhandled error in main process:', error);
  publishing({ logs: `Unhandled error in main process: ${error.message}`, channels: 'log' });
  process.exit(1);
});