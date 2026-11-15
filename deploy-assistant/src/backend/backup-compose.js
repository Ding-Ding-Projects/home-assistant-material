'use strict';
const { composeYaml } = require('./compose');
function backupCompose(inst) {
  if (!inst.backupHostingFull) return composeYaml(inst);
  // Validate the common fields through the normal target serializer first.
  composeYaml(inst);
  const name = (inst.prefix || 'ham') + '-' + inst.slug;
  return ['name: ' + name, 'services:', '  homeassistant:', '    image: ghcr.io/ding-ding-projects/home-assistant-material-full:' + inst.tag, '    container_name: ' + name, '    restart: unless-stopped', '    privileged: true', '    mem_limit: 6g', '    stop_grace_period: 3m', '    ports:', '      - "' + inst.port + ':80"', '    volumes:', '      - data:/var/lib/ha-material', '    environment:', '      TZ: ' + JSON.stringify(inst.timezone || 'UTC'), 'volumes:', '  data:', '    name: ' + name + '-data', ''].join('\n');
}
module.exports = { backupCompose };
