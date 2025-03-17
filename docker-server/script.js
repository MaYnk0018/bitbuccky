// const { exec } = require('child_process');
// const path = require('path');
// const fs = require('fs');
// const { S3Client, PutObjectCommand } = require('@aws-sdk/client-s3');
// const mime = require('mime-types');

// // const s3 = new S3Client({
// //     region: 'us-east-1',
// //     s3Key: process.env.S3_KEY,//AKIA5CBGTJJSUOPJ4VF5
// //     s3Secret: process.env.S3_SECRET//kFok2yqzJtGFQQeW5ssZbN02+kPK5kGKO1IBL3KS
// // });

// const s3 = new S3Client({
//     region: 'us-east-1',
//     credentials: {
//         accessKeyId: process.env.S3_KEY,
//         secretAccessKey: process.env.S3_SECRET
//     }
// });

// const project_id = process.env.PROJECT_ID;
// async function init() {
//     console.log('init');
//     const dir = path.join(__dirname, 'output');

//     const p = exec(`cd ${dir} && npm install && npm run dev`)

//     p.stdout.on('data', (data) => {
//         console.log(data.toString());
//     });

//     p.stdout.on('error', (error) => {
//         console.error(error.toString());
//     });

//     p.on('close', async (code) => {
//         console.log('closed', code);
//         const pathFile = path.join(__dirname, 'output', 'dist');

//         //readdir with recursive true;

//         const list = fs.readdirSync(pathFile, { withFileTypes: true, recursive: true }); //recursive might not work
//         //iterate on each file

//         for (const filePath of list) {
//             //if it is a directory continue
//             if (fileEntry.isDirectory()) continue;

//             const fullPath = path.join(pathFile, fileEntry.path);
//             const relativePath = path.relative(pathFile, fullPath);

//             const command = new PutObjectCommand({
//                 Bucket: 'gitku',
//                 Key: `__output/${project_id}/${relativePath}`,
//                 Body: fs.createReadStream(fullPath),
//                 ContentType: mime.lookup(fullPath) || 'application/octet-stream'
//             });

//             try {
//                 const data = await S3Client.send(command);
//                 console.log("uploaded", filepath);
//                 console.log(data);
//             } catch (error) {
//                 console.error(error);
//             }

//             console.log('Done');

//             //process.exit(code);
//         }
//     })



// }
// init();


const { exec } = require('child_process');
const path = require('path');
const fs = require('fs');
const { S3Client, PutObjectCommand } = require('@aws-sdk/client-s3');
const mime = require('mime-types');

// Initialize S3 client with proper credentials
// const s3 = new S3Client({
//     region: 'us-east-1',
//     credentials: {
//         accessKeyId: process.env.S3_KEY,
//         secretAccessKey: process.env.S3_SECRET
//     }
// });
// endpoint: 'https://s3.amazonaws.com', // Add explicit endpoint
//     forcePathStyle: true, // Use path-style addressing
const s3 = new S3Client({
    region: 'ap-south-1', // This might need to be updated based on your bucket's region
    
    credentials: {
        accessKeyId: process.env.S3_KEY,
        secretAccessKey: process.env.S3_SECRET
    }
});

// Validate required environment variables
function validateEnvironment() {
    const requiredVars = ['S3_KEY', 'S3_SECRET', 'PROJECT_ID'];
    const missing = requiredVars.filter(varName => !process.env[varName]);
    
    if (missing.length > 0) {
        throw new Error(`Missing required environment variables: ${missing.join(', ')}`);
    }
    
    return process.env.PROJECT_ID;
}

// Execute shell command with proper error handling
function executeCommand(command, cwd) {
    return new Promise((resolve, reject) => {
        console.log(`Executing: ${command} in ${cwd}`);
        
        const process = exec(command, { cwd });
        
        process.stdout.on('data', (data) => {
            console.log(`[stdout] ${data.toString().trim()}`);
        });
        
        process.stderr.on('data', (data) => {
            console.error(`[stderr] ${data.toString().trim()}`);
        });
        
        process.on('error', (error) => {
            console.error(`Execution error: ${error.message}`);
            reject(error);
        });
        
        process.on('close', (code) => {
            console.log(`Command exited with code ${code}`);
            if (code === 0) {
                resolve();
            } else {
                reject(new Error(`Command failed with exit code ${code}`));
            }
        });
    });
}

// Upload a single file to S3
// async function uploadFile(fullPath, relativePath, projectId) {
//     const retries = 3;
    
//     for (let attempt = 1; attempt <= retries; attempt++) {
//         try {
//             const command = new PutObjectCommand({
//                 Bucket: 'gitku',
//                 Key: `__output/${projectId}/${relativePath}`,
//                 Body: fs.createReadStream(fullPath),
//                 ContentType: mime.lookup(fullPath) || 'application/octet-stream'
//             });
            
//             const data = await s3.send(command);
//             console.log(`Successfully uploaded: ${relativePath}`);
//             return data;
//         } catch (error) {
//             console.error(`Upload attempt ${attempt}/${retries} failed for ${relativePath}:`, error.message);
            
//             if (attempt === retries) {
//                 throw error;
//             }
            
//             // Wait before retrying (exponential backoff)
//             await new Promise(r => setTimeout(r, 1000 * attempt));
//         }
//     }
// }

// Upload a single file to S3
async function uploadFile(fullPath, relativePath, projectId) {
    const retries = 3;
    
    for (let attempt = 1; attempt <= retries; attempt++) {
      try {
        // Read the file content into memory instead of streaming
        const fileContent = fs.readFileSync(fullPath);
        
        const command = new PutObjectCommand({
          Bucket: 'gitku',
          Key: `__output/${projectId}/${relativePath}`,
          Body: fileContent,
          ContentType: mime.lookup(fullPath) || 'application/octet-stream'
        });
        
        const data = await s3.send(command);
        console.log(`Successfully uploaded: ${relativePath}`);
        return data;
      } catch (error) {
        console.error(`Upload attempt ${attempt}/${retries} failed for ${relativePath}:`, error.message);
        
        if (attempt === retries) {
          throw error;
        }
        
        // Wait before retrying (exponential backoff)
        await new Promise(r => setTimeout(r, 1000 * attempt));
      }
    }
  }

// Upload all files in directory
// async function uploadDirectory(directory, projectId) {
//     console.log(`Starting upload from ${directory} for project ${projectId}`);
    
//     try {
//         // Check if directory exists
//         if (!fs.existsSync(directory)) {
//             throw new Error(`Distribution directory not found: ${directory}`);
//         }
        
//         // Get all files recursively
//         const files = fs.readdirSync(directory, { withFileTypes: true, recursive: true });
//         const fileEntries = files.filter(entry => !entry.isDirectory());
        
//         console.log(`Found ${fileEntries.length} files to upload`);
        
//         // Upload files with progress tracking
//         const results = [];
//         let uploadedCount = 0;
        
//         for (const fileEntry of fileEntries) {
//             const fullPath = path.join(directory, fileEntry.path || path.join(fileEntry.path || '', fileEntry.name));
//             const relativePath = path.relative(directory, fullPath);
            
//             try {
//                 const result = await uploadFile(fullPath, relativePath, projectId);
//                 results.push({ file: relativePath, success: true });
//             } catch (error) {
//                 results.push({ file: relativePath, success: false, error: error.message });
//             }
            
//             uploadedCount++;
//             if (uploadedCount % 10 === 0 || uploadedCount === fileEntries.length) {
//                 console.log(`Progress: ${uploadedCount}/${fileEntries.length} files processed`);
//             }
//         }
        
//         // Report summary
//         const successful = results.filter(r => r.success).length;
//         console.log(`Upload complete: ${successful}/${results.length} successful`);
        
//         if (successful < results.length) {
//             const failed = results.filter(r => !r.success);
//             console.error(`Failed uploads (${failed.length}):`, failed.map(f => f.file).join(', '));
//             throw new Error(`${failed.length} files failed to upload`);
//         }
        
//         return results;
//     } catch (error) {
//         console.error('Error during directory upload:', error);
//         throw error;
//     }
// }

// Upload all files in directory
async function uploadDirectory(directory, projectId) {
    console.log(`Starting upload from ${directory} for project ${projectId}`);
    
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
        }
      }
      
      // Report summary
      const successful = results.filter(r => r.success).length;
      console.log(`Upload complete: ${successful}/${results.length} successful`);
      
      if (successful < results.length) {
        const failed = results.filter(r => !r.success);
        console.error(`Failed uploads (${failed.length}):`, failed.map(f => f.file).join(', '));
        throw new Error(`${failed.length} files failed to upload`);
      }
      
      return results;
    } catch (error) {
      console.error('Error during directory upload:', error);
      throw error;
    }
  }

// Main function with proper cleanup
async function init() {
    let exitCode = 0;
    let projectId;
    
    try {
        console.log('Starting build and deploy process');
        
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
    } catch (error) {
        console.error('Build and deploy failed:', error);
        exitCode = 1;
    } finally {
        // Cleanup (e.g., temporary files, connections)
        try {
            console.log('Performing cleanup');
            // Add any cleanup code here if needed
            
            // For example, you might want to remove any temporary files:
            // const tempDir = path.join(__dirname, 'temp');
            // if (fs.existsSync(tempDir)) {
            //     fs.rmSync(tempDir, { recursive: true, force: true });
            // }
        } catch (cleanupError) {
            console.error('Error during cleanup:', cleanupError);
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
    process.exit(1);
});