// Packaging. Windows uses Squirrel (Setup.exe, RELEASES, .nupkg); macOS a zip; Linux a .deb and a zip.
// Nothing is code-signed: every signing input is left empty on purpose.
module.exports = {
  packagerConfig: {
    name: 'Home Assistant Material Deploy Assistant',
    executableName: 'ham-deploy-assistant',
    icon: 'build/icon',
    asar: true,
    osxSign: undefined,
    osxNotarize: undefined,
    ignore: [/^\/test\//, /^\/out\//]
  },
  makers: [
    { name: '@electron-forge/maker-squirrel', platforms: ['win32'], config: { name: 'ham_deploy_assistant', setupExe: 'HAM-Deploy-Assistant-Setup.exe', setupIcon: 'build/icon.ico', noMsi: true } },
    { name: '@electron-forge/maker-zip', platforms: ['darwin', 'linux'] },
    { name: '@electron-forge/maker-deb', platforms: ['linux'], config: { options: { name: 'ham-deploy-assistant', productName: 'Home Assistant Material Deploy Assistant', icon: 'build/icon.png', categories: ['Utility'] } } }
  ]
};
