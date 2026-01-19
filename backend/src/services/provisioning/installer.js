const SSHService = require('./ssh');
const logger = require('../../utils/logger');
const { generateSecurePassword } = require('../../utils/crypto');

class StackInstaller {
  constructor(serverIp, rootPassword) {
    this.serverIp = serverIp;
    this.rootPassword = rootPassword;
    this.ssh = new SSHService();
  }

  async connect() {
    await this.ssh.connect(this.serverIp, { password: this.rootPassword });
  }

  disconnect() {
    this.ssh.disconnect();
  }

  async installBasePackages() {
    logger.provisioning(this.serverIp, 'base_packages', 'starting');
    
    const script = `
      export DEBIAN_FRONTEND=noninteractive
      apt-get update -y
      apt-get upgrade -y
      apt-get install -y curl wget git nginx certbot python3-certbot-nginx
    `;
    
    await this.ssh.executeScript(script, 'base package installation');
    logger.provisioning(this.serverIp, 'base_packages', 'completed');
  }

  async installDocker() {
    logger.provisioning(this.serverIp, 'docker', 'starting');
    
    const script = `
      curl -fsSL https://get.docker.com | sh
      systemctl enable docker
      systemctl start docker
      docker --version
    `;
    
    const output = await this.ssh.executeScript(script, 'Docker installation');
    logger.provisioning(this.serverIp, 'docker', 'completed', { version: output.trim() });
  }

  async installPostgreSQL() {
    logger.provisioning(this.serverIp, 'postgresql', 'starting');
    
    const postgresPassword = generateSecurePassword(32);
    
    const script = `
      apt-get install -y postgresql postgresql-contrib
      systemctl enable postgresql
      systemctl start postgresql
      sudo -u postgres psql -c "ALTER USER postgres PASSWORD '${postgresPassword}';"
    `;
    
    await this.ssh.executeScript(script, 'PostgreSQL installation');
    logger.provisioning(this.serverIp, 'postgresql', 'completed');
    
    return { postgresPassword };
  }

  async installN8N(domain, adminPassword = null) {
    logger.provisioning(this.serverIp, 'n8n', 'starting');
    
    const n8nPassword = adminPassword || generateSecurePassword(24);
    const encryptionKey = generateSecurePassword(32);
    
    const composeFile = `
version: '3'
services:
  n8n:
    image: n8nio/n8n:latest
    container_name: n8n
    restart: always
    ports:
      - "5678:5678"
    environment:
      - N8N_HOST=${domain}
      - N8N_PORT=5678
      - N8N_PROTOCOL=https
      - NODE_ENV=production
      - WEBHOOK_URL=https://${domain}
      - GENERIC_TIMEZONE=UTC
      - N8N_ENCRYPTION_KEY=${encryptionKey}
      - N8N_BASIC_AUTH_ACTIVE=true
      - N8N_BASIC_AUTH_USER=admin
      - N8N_BASIC_AUTH_PASSWORD=${n8nPassword}
    volumes:
      - n8n_data:/home/node/.n8n
volumes:
  n8n_data:
`;

    const script = `
      mkdir -p /app/n8n
      cat > /app/n8n/docker-compose.yml << 'EOF'
${composeFile}
EOF
      cd /app/n8n && docker compose up -d
      sleep 10
      docker ps | grep n8n
    `;
    
    await this.ssh.executeScript(script, 'n8n installation');
    logger.provisioning(this.serverIp, 'n8n', 'completed');
    
    return { n8nPassword, encryptionKey };
  }

  async installNocoDB(domain, dbUser, dbPassword, dbName) {
    logger.provisioning(this.serverIp, 'nocodb', 'starting');
    
    const jwtSecret = generateSecurePassword(32);
    
    const composeFile = `
version: '3'
services:
  nocodb:
    image: nocodb/nocodb:latest
    container_name: nocodb
    restart: always
    ports:
      - "8080:8080"
    environment:
      NC_DB: "pg://localhost:5432?u=${dbUser}&p=${dbPassword}&d=${dbName}"
      NC_AUTH_JWT_SECRET: "${jwtSecret}"
    volumes:
      - nocodb_data:/usr/app/data
    network_mode: host
volumes:
  nocodb_data:
`;

    const script = `
      mkdir -p /app/nocodb
      cat > /app/nocodb/docker-compose.yml << 'EOF'
${composeFile}
EOF
      cd /app/nocodb && docker compose up -d
      sleep 10
      docker ps | grep nocodb
    `;
    
    await this.ssh.executeScript(script, 'NocoDB installation');
    logger.provisioning(this.serverIp, 'nocodb', 'completed');
    
    return { nocodbUrl: `https://${domain}:8080`, jwtSecret };
  }

  async installAuthelia(domain, adminPassword = null) {
    logger.provisioning(this.serverIp, 'authelia', 'starting');
    
    const autheliaPassword = adminPassword || generateSecurePassword(16);
    const sessionSecret = generateSecurePassword(64);
    const jwtSecret = generateSecurePassword(64);
    
    const script = `
      mkdir -p /app/authelia
      
      docker run --rm authelia/authelia authelia crypto hash generate argon2 --password '${autheliaPassword}' > /tmp/hash_output.txt 2>&1
      HASH=$(grep 'Digest:' /tmp/hash_output.txt | cut -d' ' -f2)
      
      cat > /app/authelia/configuration.yml << EOF
server:
  host: 0.0.0.0
  port: 9091

log:
  level: info

jwt_secret: ${jwtSecret}
default_redirection_url: https://${domain}

authentication_backend:
  file:
    path: /config/users_database.yml
    password:
      algorithm: argon2id

access_control:
  default_policy: deny
  rules:
    - domain: "${domain}"
      policy: one_factor
    - domain: "*.${domain}"
      policy: one_factor

session:
  name: authelia_session
  secret: ${sessionSecret}
  expiration: 3600
  inactivity: 300
  domain: ${domain}

storage:
  local:
    path: /config/db.sqlite3

notifier:
  filesystem:
    filename: /config/notification.txt
EOF

      cat > /app/authelia/users_database.yml << EOF
users:
  admin:
    displayname: "Admin"
    password: "\$HASH"
    email: admin@${domain}
    groups:
      - admins
EOF

      cat > /app/authelia/docker-compose.yml << 'COMPOSE'
version: '3'
services:
  authelia:
    image: authelia/authelia:latest
    container_name: authelia
    restart: always
    ports:
      - "9091:9091"
    volumes:
      - ./configuration.yml:/config/configuration.yml:ro
      - ./users_database.yml:/config/users_database.yml:ro
      - authelia_data:/config
    environment:
      - TZ=UTC
volumes:
  authelia_data:
COMPOSE

      cd /app/authelia && docker compose up -d
    `;
    
    await this.ssh.executeScript(script, 'Authelia installation');
    logger.provisioning(this.serverIp, 'authelia', 'completed');
    
    return { autheliaPassword, autheliaUrl: `https://${domain}:9091` };
  }

  async configureNginx(domain) {
    logger.provisioning(this.serverIp, 'nginx', 'starting');
    
    const nginxConfig = `
server {
    listen 80;
    server_name ${domain};
    return 301 https://\\$server_name\\$request_uri;
}

server {
    listen 443 ssl http2;
    server_name ${domain};

    ssl_certificate /etc/letsencrypt/live/${domain}/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/${domain}/privkey.pem;

    location / {
        proxy_pass http://localhost:5678;
        proxy_http_version 1.1;
        proxy_set_header Upgrade \\$http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host \\$host;
        proxy_set_header X-Real-IP \\$remote_addr;
        proxy_set_header X-Forwarded-For \\$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \\$scheme;
    }

    location /nocodb/ {
        proxy_pass http://localhost:8080/;
        proxy_set_header Host \\$host;
        proxy_set_header X-Real-IP \\$remote_addr;
    }

    location /authelia {
        proxy_pass http://localhost:9091;
        proxy_set_header Host \\$host;
        proxy_set_header X-Real-IP \\$remote_addr;
    }
}
`;

    const script = `
      cat > /etc/nginx/sites-available/prismity << 'EOF'
${nginxConfig}
EOF
      ln -sf /etc/nginx/sites-available/prismity /etc/nginx/sites-enabled/
      rm -f /etc/nginx/sites-enabled/default
      nginx -t && systemctl reload nginx
    `;
    
    await this.ssh.executeScript(script, 'Nginx configuration');
    logger.provisioning(this.serverIp, 'nginx', 'completed');
  }

  async provisionSSL(domain, email = 'admin@prismity.ai') {
    logger.provisioning(this.serverIp, 'ssl', 'starting');
    
    const script = `
      certbot certonly --nginx -d ${domain} --non-interactive --agree-tos --email ${email} || \
      certbot certonly --standalone -d ${domain} --non-interactive --agree-tos --email ${email}
      systemctl reload nginx
    `;
    
    await this.ssh.executeScript(script, 'SSL certificate provisioning');
    logger.provisioning(this.serverIp, 'ssl', 'completed');
  }

  async createDatabase(dbName, dbUser, dbPassword) {
    logger.provisioning(this.serverIp, 'database', 'starting');
    
    const script = `
      sudo -u postgres psql << EOSQL
CREATE USER ${dbUser} WITH PASSWORD '${dbPassword}';
CREATE DATABASE ${dbName} OWNER ${dbUser};
GRANT ALL PRIVILEGES ON DATABASE ${dbName} TO ${dbUser};
\\c ${dbName}
GRANT ALL ON SCHEMA public TO ${dbUser};
EOSQL
    `;
    
    await this.ssh.executeScript(script, 'Database creation');
    logger.provisioning(this.serverIp, 'database', 'completed');
    
    return { dbName, dbUser, dbPassword };
  }

  async applySchema(dbName, dbUser, dbPassword, schemaSQL) {
    logger.provisioning(this.serverIp, 'schema', 'starting');
    
    const escapedSQL = schemaSQL.replace(/'/g, "'\\''");
    
    const script = `
      echo '${escapedSQL}' | PGPASSWORD='${dbPassword}' psql -h localhost -U ${dbUser} -d ${dbName}
    `;
    
    await this.ssh.executeScript(script, 'Schema application');
    logger.provisioning(this.serverIp, 'schema', 'completed');
  }
}

module.exports = StackInstaller;
