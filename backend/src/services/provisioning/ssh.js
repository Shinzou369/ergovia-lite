const { NodeSSH } = require('node-ssh');
const logger = require('../../utils/logger');

class SSHService {
  constructor() {
    this.ssh = new NodeSSH();
  }

  async connect(host, options = {}) {
    const {
      username = 'root',
      password = null,
      privateKey = null,
      port = 22,
      readyTimeout = 30000
    } = options;

    logger.info('Connecting to server via SSH', { host });

    try {
      await this.ssh.connect({
        host,
        port,
        username,
        password,
        privateKey,
        readyTimeout
      });

      logger.info('SSH connection established', { host });
      return true;
    } catch (error) {
      logger.error('SSH connection failed', { host, error: error.message });
      throw new Error(`SSH connection failed: ${error.message}`);
    }
  }

  async execCommand(command, options = {}) {
    const { cwd = '/', onStdout = null, onStderr = null } = options;

    logger.debug('Executing command', { command: command.substring(0, 100) });

    try {
      const result = await this.ssh.execCommand(command, {
        cwd,
        onStdout: onStdout ? (chunk) => onStdout(chunk.toString()) : undefined,
        onStderr: onStderr ? (chunk) => onStderr(chunk.toString()) : undefined
      });

      if (result.code !== 0 && result.code !== null) {
        logger.warn('Command exited with non-zero code', { 
          code: result.code, 
          stderr: result.stderr?.substring(0, 500) 
        });
      }

      return {
        code: result.code,
        stdout: result.stdout,
        stderr: result.stderr
      };
    } catch (error) {
      logger.error('Command execution failed', { error: error.message });
      throw error;
    }
  }

  async uploadFile(localPath, remotePath) {
    logger.debug('Uploading file', { localPath, remotePath });
    
    try {
      await this.ssh.putFile(localPath, remotePath);
      return true;
    } catch (error) {
      logger.error('File upload failed', { error: error.message });
      throw error;
    }
  }

  async executeScript(script, description = 'script') {
    logger.info(`Executing ${description}`);
    
    const result = await this.execCommand(script);
    
    if (result.code !== 0) {
      throw new Error(`${description} failed: ${result.stderr || 'Unknown error'}`);
    }

    return result.stdout;
  }

  disconnect() {
    this.ssh.dispose();
    logger.debug('SSH connection closed');
  }

  async waitForSSH(host, password, maxRetries = 30, delayMs = 10000) {
    for (let i = 0; i < maxRetries; i++) {
      try {
        await this.connect(host, { password, readyTimeout: 10000 });
        this.disconnect();
        return true;
      } catch (error) {
        logger.debug(`SSH not ready yet (attempt ${i + 1}/${maxRetries})`);
        await new Promise(resolve => setTimeout(resolve, delayMs));
      }
    }
    throw new Error('SSH never became available');
  }
}

module.exports = SSHService;
