module.exports = {
  PROVISIONING_STATUS: {
    PENDING: 'pending',
    CREATING_SERVER: 'creating_server',
    INSTALLING_STACK: 'installing_stack',
    CREATING_DATABASE: 'creating_database',
    DEPLOYING_WORKFLOWS: 'deploying_workflows',
    CONFIGURING_NOCODB: 'configuring_nocodb',
    COMPLETED: 'completed',
    FAILED: 'failed'
  },

  CLIENT_STATUS: {
    TRIAL: 'trial',
    ACTIVE: 'active',
    SUSPENDED: 'suspended',
    CANCELLED: 'cancelled'
  },

  HETZNER: {
    DEFAULT_SERVER_TYPE: 'cx21',
    DEFAULT_LOCATION: 'nbg1',
    DEFAULT_IMAGE: 'ubuntu-22.04'
  },

  STACK_PORTS: {
    N8N: 5678,
    NOCODB: 8080,
    AUTHELIA: 9091,
    POSTGRES: 5432
  },

  WORKFLOW_COUNT: 24,

  JWT_EXPIRY: '7d',
  
  RATE_LIMITS: {
    WINDOW_MS: 15 * 60 * 1000,
    MAX_REQUESTS: 100
  }
};
