require('dotenv').config();
const Docker = require('dockerode');
const docker = new Docker({host: process.env.VM_IP, port: process.env.VM_PORT});

const execute_c = async (code, input) => {
    const escapedCode = code.replace(/"/g, '\\"');
    console.log(escapedCode);
    
    try {
        const container = await docker.createContainer({
          Image: 'gcc',
          Cmd: ['/bin/bash', '-c', `echo "${escapedCode}" > temp.c && gcc -o temp temp.c && timeout 5 ./temp <<< "${input}"`],
          AttachStdout: true,
          AttachStderr: true,
          Tty: true
        });
        container.start().catch(err => reject(err));
      
        return new Promise((resolve, reject) => {
          container.attach({ stream: true, stdout: true, stderr: true }, async (err, stream) => {
            if (err) {
              reject(err);
              return;
            }
      
            let output = '';
            stream.on('data', chunk => output += chunk.toString());
      
            stream.on('end', async () => {
              try {
                const containerInfo = await container.inspect();
                const exitCode = containerInfo.State.ExitCode;
                const stripAnsi = (await import('strip-ansi')).default;

                if (exitCode === 124) {
                  resolve({ ans: `EXECUTION TIMED OUT\nOUTPUT CAPTURED TILL TIMEOUT\n${stripAnsi(output.slice(0,500000))}`});
                } else if (exitCode === 1) {                  
                  resolve({ans:stripAnsi(output.slice(0,500000))})
                } else if (exitCode !== 0) {
                  reject(new Error(`Program exited with status ${exitCode}`));
                } else {
                  await container.wait();
                  resolve({ ans: stripAnsi(output.slice(0,500000)) });
                }
              } catch (error) {
                reject(error);
              } finally {
                try {
                  await container.remove();
                } catch (removeError) {
                  console.error('Error removing container:', removeError);
                }
              }
            });
          });
        });
      } catch (error) {
        console.log(error);
        throw new Error('Internal server error');
    }
  };

  module.exports = execute_c;