'use strict';
// Writes the Docker Compose file for one instance. Each instance gets its own project name,
// container name, published port and config folder, so any number can run side by side.

const IMAGE = 'ghcr.io/ding-ding-projects/home-assistant-material';

function composeYaml({ slug, port, tag = 'latest', timezone = 'UTC', restart = 'unless-stopped', configPath = './config', memoryLimit = '' }) {
  if (!/^[a-z0-9][a-z0-9-]{0,62}$/.test(slug)) throw new Error('The instance name must be lower-case letters, digits and dashes.');
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('The port must be a whole number from 1 to 65535.');
  if (!/^[A-Za-z0-9._-]{1,128}$/.test(tag)) throw new Error('The image tag has characters a tag cannot have.');
  const lines = [
    '# Written by Home Assistant Material Deploy Assistant. Edit it from the app, or by hand;',
    '# the app reads it again before every start.',
    'name: ham-' + slug,
    'services:',
    '  homeassistant:',
    '    image: ' + IMAGE + ':' + tag,
    '    container_name: ham-' + slug,
    '    restart: ' + restart,
    '    ports:',
    '      - "' + port + ':8123"',
    '    volumes:',
    '      - "' + configPath + ':/config"',
    '    environment:',
    '      TZ: "' + String(timezone).replace(/"/g, '') + '"'
  ];
  if (memoryLimit) lines.push('    mem_limit: ' + memoryLimit);
  return lines.join('\n') + '\n';
}

module.exports = { composeYaml, IMAGE };
