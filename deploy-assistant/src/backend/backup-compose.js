'use strict';
const { composeYaml } = require('./compose');
function backupCompose(inst) {
  if (!inst.backupHostingFull) return composeYaml(inst);
  // Validate the common fields through the normal target serializer first.
  composeYaml(inst);
  const name = (inst.prefix || 'ham') + '-' + inst.slug;
  // A full-mode instance with an SSH port publishes container port 22222 on it and tells the image which port
  // that is, so the SSH access page shows it. Instances made before the port existed have none: SSH stays off.
  const ssh = Number.isInteger(inst.sshPort) && inst.sshPort >= 1 && inst.sshPort <= 65535 ? inst.sshPort : 0;
  return [
    'name: ' + name, 'services:', '  homeassistant:',
    '    image: ghcr.io/ding-ding-projects/home-assistant-material-full:' + inst.tag,
    '    container_name: ' + name, '    restart: unless-stopped', '    privileged: true', '    mem_limit: 6g', '    stop_grace_period: 3m',
    '    ports:', '      - "' + inst.port + ':80"'
  ].concat(
    ssh ? ['      - "' + ssh + ':22222"'] : [],
    ['    volumes:', '      - data:/var/lib/ha-material', '    environment:', '      TZ: ' + JSON.stringify(inst.timezone || 'UTC')],
    ssh ? ['      HA_MATERIAL_SSH_PORT: "' + ssh + '"'] : [],
    ['volumes:', '  data:', '    name: ' + name + '-data', '']
  ).join('\n');
}
module.exports = { backupCompose };
