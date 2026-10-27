const { app, BrowserWindow } = require('electron')
const fs = require('node:fs')
const path = require('node:path')

app.disableHardwareAcceleration()

app.whenReady().then(async () => {
  const win = new BrowserWindow({
    width: 1024,
    height: 1024,
    show: false,
    frame: false,
    transparent: true,
    backgroundColor: '#00000000',
    webPreferences: { offscreen: true }
  })
  await win.loadFile(path.join(__dirname, 'icon.svg'))
  await new Promise((resolve) => setTimeout(resolve, 500))
  const image = await win.webContents.capturePage()
  fs.writeFileSync(path.join(__dirname, 'icon.png'), image.toPNG())
  console.log('wrote', path.join(__dirname, 'icon.png'), image.getSize())
  app.quit()
})
