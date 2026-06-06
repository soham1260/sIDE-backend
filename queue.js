const { Queue, Worker } = require("bullmq");
const IORedis = require("ioredis");
const mongoose = require("mongoose");
const Docker = require('dockerode');

const execute_c = require("./execution_scripts/execute_c");
const execute_cpp = require("./execution_scripts/execute_cpp");
const execute_python = require("./execution_scripts/execute_python");
const execute_java = require("./execution_scripts/execute_java");
const execute_javascript = require("./execution_scripts/execute_javascript");

let docker;
if (process.env.VM_IP && process.env.VM_PORT) {
  docker = new Docker({
    host: process.env.VM_IP,
    port: process.env.VM_PORT,
  });
  console.log(`Connected to remote Docker: ${process.env.VM_IP}:${process.env.VM_PORT}`);
} else {
  docker = new Docker();
  console.log('Using local Docker socket');
}

const connection = new IORedis(process.env.REDIS_URL, {
  maxRetriesPerRequest: null
});

const codeExecutionQueue = new Queue("code-execution", { connection });

const worker = new Worker("code-execution", async (job) => {
  const { code, input, language, filename, userId } = job.data;
  let response;

  try {
    switch (language) {
      case "c":
        response = await execute_c(docker, code, input);
        break;
      case "cpp":
        response = await execute_cpp(docker, code, input);
        break;
      case "python":
        response = await execute_python(docker, code, input);
        break;
      case "java":
        response = await execute_java(docker, code, input, filename);
        break;
      case "javascript":
        response = await execute_javascript(docker, code, input);
        break;
      default:
        throw new Error("Unexpected Language input");
    }
  } catch (err) {
    console.error(`Error executing language ${language} inside worker:`, err);
    throw err;
  }

  if (userId && response) {
    try {
      const User = mongoose.model("User");
      const user = await User.findById(userId);

      if (user) {
        user.execution_history.push({ filename, code, language, input, output: response.ans, date: Date.now() });
        await user.save();
      }
    } catch (error) {
      console.error("Error saving execution history to database:", error);
    }
  }

  return response;
}, { connection });

worker.on("failed", (job, err) => {
  console.error(`Job ${job ? job.id : 'unknown'} failed:`, err);
});

module.exports = { codeExecutionQueue };