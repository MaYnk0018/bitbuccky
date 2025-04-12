const express = require('express');
const { generateSlug } = require('random-word-slugs');
const { ECSClient, RunTaskCommand } = require('@aws-sdk/client-ecs');
const dotenv = require('dotenv');
const Redis = require('ioredis');
const { Server } = require('socket.io');



dotenv.config();

const app = express();
const PORT = process.env.PORT || 9000;

const subscriber = new Redis(process.env.AVIENT_REDIS_URL);
const io = new Server({ cors: '*' })

// socket set to listen to the port 9001
io.on('connection', (socket) => {
  console.log('New client connected');
  socket.on('subscribe', (channel) => {
    console.log(`Client joined project: ${channel}`);
    socket.join(channel);
    socket.emit('message', `Subscribed to project: ${channel}`);
  }); 

  socket.on('disconnect', () => {
    console.log('Client disconnected');
  });
});

io.listen(9001, () => console.log('Socket.io server running on port 9001'));  
const ecsClient = new ECSClient({
  region: process.env.AWS_REGION || 'ap-south-1',
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY
  }
});


const config = {
  CLUSTER: process.env.ECS_CLUSTER || 'arn:aws:ecs:ap-south-1:897729120869:cluster/builder-cluster-try',
  TASK: process.env.ECS_TASK || 'arn:aws:ecs:ap-south-1:897729120869:task-definition/builder-task-final',
  SUBNETS: process.env.SUBNETS ? process.env.SUBNETS.split(',') :
    ['subnet-03983ee7c446b18fb', 'subnet-0b2007697e88a14f7', 'subnet-0e6da54b94869772d'],
  SECURITY_GROUPS: process.env.SECURITY_GROUPS ? process.env.SECURITY_GROUPS.split(',') :
    ['sg-0b3f4474a8ad9c24e']
};


app.use(express.json());


const validateProjectInput = (req, res, next) => {
  const { gitURL } = req.body;

  if (!gitURL) {
    return res.status(400).json({
      status: 'error',
      message: 'Git repository URL is required'
    });
  }

  next();
};


app.post('/project', validateProjectInput, async (req, res) => {
  try {
    const { gitURL, slug } = req.body;
    const projectSlug = slug || generateSlug();


    const command = new RunTaskCommand({
      cluster: config.CLUSTER,
      taskDefinition: config.TASK,
      launchType: 'FARGATE',
      count: 1,
      networkConfiguration: {
        awsvpcConfiguration: {
          assignPublicIp: 'ENABLED',
          subnets: config.SUBNETS,
          securityGroups: config.SECURITY_GROUPS
        }
      },
      overrides: {
        containerOverrides: [
          {
            name: 'builder-image-final',
            environment: [
              { name: 'GIT_REPOSITORY_URL', value: gitURL },
              { name: 'PROJECT_ID', value: projectSlug },
              { name: 'AWS_ACCESS_KEY_ID', value: process.env.AWS_ACCESS_KEY_ID || '' },
              { name: 'S3_BUCKET', value: process.env.S3_BUCKET || '' },
              { name: 'AWS_SECRET_ACCESS_KEY', value: process.env.AWS_SECRET_ACCESS_KEY || '' },
            ]
          }
        ]
      }
    });

    const result = await ecsClient.send(command);

    return res.status(201).json({
      status: 'queued',
      data: {
        projectSlug,
        url: `http://${projectSlug}.localhost:8000`,
        taskArn: result.tasks?.[0]?.taskArn
      }
    });
  } catch (error) {
    console.error('Failed to create project:', error);
    return res.status(500).json({
      status: 'error',
      message: 'Failed to create project',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});



async function initRedisSubscriber() {
  console.log('Connecting to Redis and subscribing to logs:*');
  try {
    await subscriber.psubscribe('logs:*', (err, count) => {
      if (err) {
        console.error('Failed to subscribe to Redis channels:', err);
        return;
      }
      console.log(`Subscribed to ${count} Redis channel(s).`);
    });

    subscriber.on('pmessage', (pattern, channel, message) => {
      const room = channel.replace('logs:', ''); // Extract project ID from channel
      io.to(room).emit('message', JSON.parse(message));
      console.log(`Received message from channel ${channel}:`, message);
    });
  } catch (error) {
    console.error('Error initializing Redis subscriber:', error);
  }
}

initRedisSubscriber();

app.get('/health', (req, res) => {
  res.status(200).json({ status: 'healthy' });
});

app.listen(PORT, () => console.log(`Server running on port ${PORT}`));

process.on('SIGTERM', () => {
  console.log('SIGTERM received, shutting down server');
  process.exit(0);
});